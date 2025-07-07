use crate::keyboard_events::{KeyPressedEvent, KeyReleasedEvent};
use crate::render::passes::main::MainRenderPass;
use crate::render::passes::shadow::{ShadowRenderPass, SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR};
use crate::render::passes::tonemap_resolve::TonemapResolvePass;
use crate::render::util::get_view_projection_matrix;
use crate::vxm_mesh::MeshedVoxelsFace;
use bevy::app::PluginsState;
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::math::primitives::Cuboid;
use bevy::prelude::*;
use bevy::render::camera::CameraProjection;
use bytemuck::{Pod, Zeroable};
use std::mem::size_of;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{mpsc, Arc};
use std::thread;
use wgpu::hal::DynSurface;
use wgpu::util::DeviceExt;
use wgpu::{
    BindGroup, Buffer, Device, Face, Queue, RenderPipeline, Surface, SurfaceTexture, TextureFormat,
    TextureView, VertexAttribute, VertexStepMode,
};
use winit::event::ElementState;
use winit::keyboard::Key;
use winit::raw_window_handle::{
    HasRawDisplayHandle, HasRawWindowHandle, RawDisplayHandle, RawWindowHandle,
};
use winit::{
    application::ApplicationHandler,
    event::WindowEvent,
    event_loop::{ActiveEventLoop, EventLoop},
    window::{Window, WindowId},
};

#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct InstanceData {
    pub(crate) position: [u8; 3],
    pub(crate) width: u8,
    pub(crate) hsl: u16,
    pub(crate) ambient_occlusion: u8,
    pub(crate) height: u8,
}

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
struct WireframeVertex {
    position: [f32; 3],
    color: [f32; 4],
}

#[derive(Component, Deref, Clone)]
pub struct InstanceMaterialData(pub Arc<Vec<InstanceData>>);

#[derive(Debug)]
struct WindowCreationData {
    surface: Surface<'static>,
    initial_size: (u32, u32),
}

pub const SURFACE_FORMAT: TextureFormat = TextureFormat::Rgba16Float;

struct RenderApp {
    pub(crate) instance: wgpu::Instance,
    pub(crate) device: Arc<Device>,
    pub(crate) queue: Queue,
    pub(crate) render_pipeline: RenderPipeline,
    pub(crate) debug_quad_render_pipeline: RenderPipeline,
    pub(crate) debug_quad_bind_group: BindGroup,
    pub(crate) main_pass_texture_view: TextureView,
    pub(crate) main_pass_texture: wgpu::Texture,
    pub(crate) wireframe_pipeline: RenderPipeline,
    pub(crate) main_pass: MainRenderPass,
    pub(crate) shadow_pass: ShadowRenderPass,
    pub(crate) tonemap_resolve_pass: TonemapResolvePass,
    pub(crate) window_creation_receiver: Receiver<WindowCreationData>,
    pub(crate) window_resize_receiver: Receiver<(u32, u32)>,
}

const DEBUG_DEPTH_BIND_GROUP_LAYOUT_DESCRIPTOR: &wgpu::BindGroupLayoutDescriptor =
    &wgpu::BindGroupLayoutDescriptor {
        label: Some("Debug Quad Bind Group Layout"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Depth,
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        }],
    };

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
pub struct Uniforms {
    pub view_proj: Mat4,
    pub camera_position: Vec4,
}

// Create wireframe vertices for a cuboid
fn create_wireframe_cuboid_vertices(cuboid: &Cuboid, color: [f32; 4]) -> Vec<WireframeVertex> {
    let half_size = cuboid.half_size;
    let min_x = -half_size.x;
    let max_x = half_size.x;
    let min_y = -half_size.y;
    let max_y = half_size.y;
    let min_z = -half_size.z;
    let max_z = half_size.z;

    let corners = [
        // Bottom face corners
        [min_x, min_y, min_z],
        [max_x, min_y, min_z],
        [max_x, min_y, max_z],
        [min_x, min_y, max_z],
        // Top face corners
        [min_x, max_y, min_z],
        [max_x, max_y, min_z],
        [max_x, max_y, max_z],
        [min_x, max_y, max_z],
    ];

    // Lines connecting corners
    let indices = [
        // Bottom face
        0, 1, 1, 2, 2, 3, 3, 0, // Top face
        4, 5, 5, 6, 6, 7, 7, 4, // Connecting edges
        0, 4, 1, 5, 2, 6, 3, 7,
    ];

    // Create vertices for each line
    indices
        .iter()
        .map(|&i| WireframeVertex {
            position: corners[i],
            color,
        })
        .collect()
}

pub struct DrawBuffers<'a> {
    pub instance_buffer: &'a Buffer,
    pub indirect_buffer: &'a Buffer,
    pub mvp_buffer: &'a Buffer,
    pub uniform_buffer: &'a Buffer,
    pub vertex_buffer: &'a Buffer,
    pub lights_uniform_buffer: &'a Buffer,
}

impl RenderApp {
    fn get_debug_quad_render_pipeline(
        device: &Device,
        bind_group_layout: &wgpu::BindGroupLayout,
    ) -> RenderPipeline {
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Debug Quad Shader"),
            source: wgpu::ShaderSource::Wgsl(
                include_str!("shaders/quarter-screen-quad.wgsl").into(),
            ),
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Debug Quad Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vertex"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fragment"),
                compilation_options: Default::default(),
                targets: &[Some(SURFACE_FORMAT.into())],
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: None,
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                front_face: wgpu::FrontFace::Ccw,
                ..default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        render_pipeline
    }

    fn get_wireframe_pipeline(
        device: &Device,
        bind_group_layout: &wgpu::BindGroupLayout,
    ) -> RenderPipeline {
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Wireframe Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Wireframe Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/wireframe.wgsl").into()),
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Wireframe Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: size_of::<WireframeVertex>() as u64,
                    step_mode: VertexStepMode::Vertex,
                    attributes: &[
                        VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 0,
                            shader_location: 0,
                        },
                        VertexAttribute {
                            format: wgpu::VertexFormat::Float32x4,
                            offset: (3 * std::mem::size_of::<f32>()) as u64,
                            shader_location: 1,
                        },
                    ],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(SURFACE_FORMAT.into())],
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: None,
                // Use line list for wireframe rendering
                topology: wgpu::PrimitiveTopology::LineList,
                front_face: wgpu::FrontFace::Ccw,
                ..default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: TextureFormat::Depth24Plus,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Greater,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState {
                count: 4,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
            cache: None,
        });
        render_pipeline
    }

    fn new(
        device: Arc<Device>,
        queue: Queue,
        instance: wgpu::Instance,
        window_creation_receiver: Receiver<WindowCreationData>,
        initial_size: (u32, u32),
        window_resize_receiver: Receiver<(u32, u32)>,
    ) -> RenderApp {
        let shadow_pass = ShadowRenderPass::new(&device);

        let shadow_bind_group_layout =
            device.create_bind_group_layout(SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR);

        let main_pass = MainRenderPass::new(&device, &shadow_bind_group_layout, initial_size);
        let bind_group_layout = MainRenderPass::get_bind_group_layout(&device);
        let render_pipeline = MainRenderPass::get_pipeline(&device, &shadow_bind_group_layout);

        let debug_quad_bind_group_layout =
            device.create_bind_group_layout(DEBUG_DEPTH_BIND_GROUP_LAYOUT_DESCRIPTOR);
        let debug_quad_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Debug Quad Bind Group"),
            layout: &debug_quad_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&shadow_pass.shadow_map_texture_view),
            }],
        });
        let debug_quad_render_pipeline =
            Self::get_debug_quad_render_pipeline(&device, &debug_quad_bind_group_layout);

        let wireframe_pipeline = Self::get_wireframe_pipeline(&device, &bind_group_layout);

        let main_pass_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Main Pass Texture"),
            size: wgpu::Extent3d {
                width: initial_size.0,
                height: initial_size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 4,
            dimension: wgpu::TextureDimension::D2,
            format: SURFACE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[SURFACE_FORMAT],
        });

        let tonemap_resolve_pass = TonemapResolvePass::new(&device, initial_size);

        let main_pass_texture_view = main_pass_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Main Pass Texture View"),
            format: Some(SURFACE_FORMAT),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
        });

        let state = RenderApp {
            device,
            queue,
            instance,
            render_pipeline,
            debug_quad_render_pipeline,
            debug_quad_bind_group,
            main_pass_texture_view,
            main_pass_texture,
            wireframe_pipeline,
            main_pass,
            shadow_pass,
            window_creation_receiver,
            window_resize_receiver,
            tonemap_resolve_pass,
        };

        state
    }

    fn update_render_targets(&mut self, size: (u32, u32)) {
        self.main_pass_texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Main Pass Texture"),
            size: wgpu::Extent3d {
                width: size.0,
                height: size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 4,
            dimension: wgpu::TextureDimension::D2,
            format: SURFACE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[SURFACE_FORMAT],
        });

        let shadow_bind_group_layout = self
            .device
            .create_bind_group_layout(SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR);

        self.main_pass = MainRenderPass::new(&self.device, &shadow_bind_group_layout, size);

        self.main_pass_texture_view =
            self.main_pass_texture
                .create_view(&wgpu::TextureViewDescriptor {
                    label: Some("Main Pass Texture View"),
                    format: Some(SURFACE_FORMAT),
                    dimension: Some(wgpu::TextureViewDimension::D2),
                    aspect: wgpu::TextureAspect::All,
                    ..Default::default()
                });
    }

    fn resize(&mut self, size: (u32, u32)) {
        self.update_render_targets(size);
    }

    fn get_texture_view(&self, surface_texture: &SurfaceTexture) -> wgpu::TextureView {
        surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor {
                format: Some(SURFACE_FORMAT),
                ..Default::default()
            })
    }

    fn enqueue_depth_debug_pass(&mut self, texture_view: TextureView) {
        let depth_span = info_span!("Depth Debug").entered();
        let mut depth_debug_encoder = self.device.create_command_encoder(&Default::default());
        let mut renderpass = depth_debug_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &texture_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        renderpass.set_pipeline(&self.debug_quad_render_pipeline);
        renderpass.set_bind_group(0, &self.debug_quad_bind_group, &[]);
        renderpass.draw(0..4, 0..1); // Draw the debug quad
        drop(renderpass);
        self.queue.submit([depth_debug_encoder.finish()]);
        depth_span.exit();
    }

    // TODO: move to a separate utility module
    fn enqueue_wireframe_cuboid(
        &self,
        texture_view: &TextureView,
        cuboid: Cuboid,
        transform: Mat4,
        color: [f32; 4],
        bind_group: &BindGroup,
    ) -> wgpu::CommandBuffer {
        // Create wireframe vertices for the cuboid with given transform
        let mut vertices = create_wireframe_cuboid_vertices(&cuboid, color);

        // Apply the transform to each vertex
        for vertex in &mut vertices {
            let pos = Vec4::new(
                vertex.position[0],
                vertex.position[1],
                vertex.position[2],
                1.0,
            );

            let transformed = transform * pos;
            vertex.position = [
                transformed.x / transformed.w,
                transformed.y / transformed.w,
                transformed.z / transformed.w,
            ];
        }

        // Wireframe render pass
        {
            // Create command encoder
            let mut encoder = self
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Wireframe Render Encoder"),
                });

            {
                // Create vertex buffer
                let vertex_buffer =
                    self.device
                        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("Wireframe Vertex Buffer"),
                            contents: bytemuck::cast_slice(&vertices),
                            usage: wgpu::BufferUsages::VERTEX,
                        });

                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("Wireframe Render Pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &self.main_pass_texture_view,
                        resolve_target: Some(&texture_view),
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Load, // Load the existing content
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });

                // Set pipeline and vertex buffer
                render_pass.set_pipeline(&self.wireframe_pipeline);
                render_pass.set_bind_group(0, bind_group, &[]);
                render_pass.set_vertex_buffer(0, vertex_buffer.slice(..));

                // Draw the wireframe (12 lines with 2 vertices each = 24 vertices total)
                render_pass.draw(0..24, 0..1);
            }

            encoder.finish()
        }
    }

    fn render(
        &mut self,
        view_proj: Mat4,
        shadow_view: Mat4,
        voxel_planes: VoxelPlanesData,
        camera_position: Vec3,
        lights_data: LightsData,
        surface_texture: SurfaceTexture,
    ) {
        if let Ok(resize_message) = self.window_resize_receiver.try_recv() {
            self.resize(resize_message);
        }

        let render_span = info_span!("Voxel render").entered();

        let surface_texture_view = self.get_texture_view(&surface_texture);
        let draw_count = voxel_planes.len() as u32;

        // Prepare buffers for the main pass
        self.main_pass
            .prepare_buffers(&self.device, &self.queue, voxel_planes);

        let uniform_buffer = &self.main_pass.uniform_buffer;
        let vertex_buffer = &self.main_pass.vertex_buffer;
        let instance_buffer = &self.main_pass.instance_buffer;
        let bind_group = &self.main_pass.bind_group;
        let indirect_buffer = &self.main_pass.indirect_buffer;
        let lights_uniform_buffer = &self.main_pass.lights_uniform_buffer;
        let mvp_buffer = &self.main_pass.mvp_buffer;

        // Shadow
        let draw_buffers = DrawBuffers {
            uniform_buffer,
            vertex_buffer,
            instance_buffer,
            indirect_buffer,
            mvp_buffer,
            lights_uniform_buffer,
        };

        self.shadow_pass.enqueue(
            &self.device,
            &self.queue,
            shadow_view,
            camera_position,
            draw_count,
            &draw_buffers,
            bind_group,
        );

        self.main_pass.enqueue(
            &self.device,
            &self.queue,
            &self.main_pass_texture_view,
            &self.shadow_pass.shadow_bind_group,
            draw_count,
            camera_position,
            lights_data,
            view_proj,
        );

        self.tonemap_resolve_pass.enqueue(
            &self.device,
            &self.queue,
            (&self.main_pass_texture, &self.main_pass_texture_view),
            (&surface_texture.texture, &surface_texture_view),
        );

        self.enqueue_depth_debug_pass(surface_texture_view.clone());

        surface_texture.present();

        render_span.exit();
    }
}

struct VoxelExtractApp {
    world_message_sender: Sender<WorldMessage>,
    app: App,
    window: Option<Window>,
    render_finished_receiver: Receiver<()>,
    window_creation_sender: Sender<WindowCreationData>,
    window_resized_sender: Sender<(u32, u32)>,
    device: Arc<Device>,
    surface_texture: Option<SurfaceTexture>,
    instance: wgpu::Instance,
}

impl VoxelExtractApp {
    fn new(
        world_message_sender: Sender<WorldMessage>,
        app: App,
        render_finished_receiver: Receiver<()>,
        window_creation_sender: Sender<WindowCreationData>,
        window_resized_sender: Sender<(u32, u32)>,
        device: Arc<Device>,
        instance: wgpu::Instance,
    ) -> Self {
        Self {
            world_message_sender,
            app,
            window: None,
            surface_texture: None,
            device,
            render_finished_receiver,
            window_creation_sender,
            window_resized_sender,
            instance,
        }
    }
}

impl ApplicationHandler for VoxelExtractApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            info!("Window already created; skipping creation");
            return;
        }
        let primary_monitor = event_loop.primary_monitor().unwrap();
        let video_mode = primary_monitor.video_modes().next().unwrap();
        let window_attributes = Window::default_attributes()
            .with_title("Soulflame")
            .with_fullscreen(Some(winit::window::Fullscreen::Exclusive(
                video_mode.clone(),
            )));
        let window = event_loop.create_window(window_attributes).unwrap();

        let initial_size = video_mode.clone().size();

        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: SURFACE_FORMAT,
            view_formats: vec![SURFACE_FORMAT],
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            width: initial_size.width,
            height: initial_size.height,
            desired_maximum_frame_latency: 2,
            present_mode: wgpu::PresentMode::Immediate,
        };
        self.window = Some(window);
        match self.window {
            Some(ref window) => {
                // Use create_surface_unsafe to avoid lifetime issues
                let surface = unsafe {
                    let target = wgpu::SurfaceTargetUnsafe::from_window(window).unwrap();
                    self.instance.create_surface_unsafe(target).unwrap()
                };

                surface.configure(&self.device, &surface_config);
                match self.window_creation_sender.send(WindowCreationData {
                    surface,
                    initial_size: (initial_size.width, initial_size.height),
                }) {
                    Ok(_) => {
                        info!("Window creation data sent successfully");
                    }
                    Err(e) => {
                        error!("Failed to send window creation data: {:?}", e);
                        return;
                    }
                }
            }
            None => {
                error!("Failed to create window");
                return;
            }
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::Destroyed => {
                info!("Window destroyed; stopping");
                event_loop.exit();
            }
            WindowEvent::KeyboardInput { event, .. } => match event.logical_key {
                Key::Named(winit::keyboard::NamedKey::Escape) => {
                    if event.state.is_pressed() {
                        event_loop.exit();
                    }
                }
                _ => match event.state {
                    ElementState::Pressed => {
                        self.app
                            .world_mut()
                            .send_event(KeyPressedEvent(event.logical_key));
                    }
                    ElementState::Released => {
                        self.app
                            .world_mut()
                            .send_event(KeyReleasedEvent(event.logical_key));
                    }
                },
            },
            WindowEvent::CloseRequested => {
                info!("The close button was pressed; stopping");
                event_loop.exit();
            }
            WindowEvent::Resized(size) => {
                info!("Resizing to {:?}", size);
                self.window_resized_sender
                    .send((size.width, size.height))
                    .expect("Failed to send window resize event");
            }
            WindowEvent::RedrawRequested => {
                match self.render_finished_receiver.try_recv() {
                    Ok(()) => {
                        self.app.update();

                        // Get camera view projection matrix
                        let world = self.app.world_mut();
                        let mut camera = world.query::<(&mut Projection, &GlobalTransform)>();
                        let (projection, global_transform) = camera.iter_mut(world).next().unwrap();
                        let view_proj = get_view_projection_matrix(
                            &projection,
                            &global_transform.compute_matrix(),
                        );

                        let camera_position = global_transform.translation();

                        // Get each voxel entity, cloning to avoid borrowing issues
                        let voxel_entities = world
                            .query::<(
                                &MeshedVoxelsFace,
                                &InstanceMaterialData,
                                &GlobalTransform,
                                &ViewVisibility,
                            )>()
                            .iter_mut(world)
                            .map(|(face, instance_data, transform, visibility)| {
                                let cloned_components = (
                                    face.clone(),
                                    instance_data.clone(),
                                    transform.clone(),
                                    visibility.clone(),
                                );
                                cloned_components
                            })
                            .collect::<Vec<_>>();

                        // Get directional light data (sun)
                        let sun_data = world
                            .query::<(&GlobalTransform, &DirectionalLight)>()
                            .iter(world)
                            .next()
                            .map(|(transform, light)| (transform.clone(), light.clone()))
                            .unwrap_or_else(|| {
                                panic!("No directional light found in the world");
                            });

                        // Get point lights data
                        let lights_data = world
                            .query::<(&GlobalTransform, &PointLight)>()
                            .iter(world)
                            .map(|(transform, light)| (transform.clone(), light.clone()))
                            .collect::<Vec<_>>();

                        self.world_message_sender
                            .send((
                                view_proj,
                                voxel_entities,
                                sun_data,
                                camera_position,
                                lights_data,
                            ))
                            .expect("Error sending voxel data to render thread");

                        if let Some(window) = &self.window {
                            let size = window.inner_size();
                            let world = self.app.world_mut();
                            let mut camera = world.query::<(&mut Projection, &GlobalTransform)>();
                            let (mut projection, _) = camera.iter_mut(world).next().unwrap();
                            // Update the projection matrix based on the current size
                            match &mut *projection {
                                Projection::Perspective(perspective) => {
                                    perspective.update(size.width as f32, size.height as f32);
                                }
                                _ => {
                                    panic!("Only perspective projection is supported");
                                }
                            }
                            window.pre_present_notify();
                        }
                    }
                    Err(mpsc::TryRecvError::Empty) => {}
                    Err(mpsc::TryRecvError::Disconnected) => {
                        event_loop.exit();
                    }
                }

                // Emits a new redraw requested event.
                if let Some(window) = &self.window {
                    window.request_redraw();
                }
            }
            _ => (),
        }
    }
}

pub fn winit_runner(
    mut app: App,
    event_loop: EventLoop<()>,
    world_message_sender: Sender<WorldMessage>,
    render_finished_receiver: Receiver<()>,
    window_created_sender: Sender<WindowCreationData>,
    window_resize_sender: Sender<(u32, u32)>,
    device: Arc<Device>,
    instance: wgpu::Instance,
) -> AppExit {
    if app.plugins_state() == PluginsState::Ready {
        app.finish();
        app.cleanup();
    }

    // Update must be called once before the event loop starts
    app.update();

    let mut extract_app = VoxelExtractApp::new(
        world_message_sender,
        app,
        render_finished_receiver,
        window_created_sender,
        window_resize_sender,
        device,
        instance,
    );

    event_loop
        .run_app(&mut extract_app)
        .expect("Event loop panicked");

    AppExit::Success
}

pub struct VoxelRenderPlugin;

pub type VoxelPlanesData = Vec<(
    MeshedVoxelsFace,
    InstanceMaterialData,
    GlobalTransform,
    ViewVisibility,
)>;

pub type SunData = (GlobalTransform, DirectionalLight);

pub type LightsData = Vec<(GlobalTransform, PointLight)>;

pub type WorldMessage = (Mat4, VoxelPlanesData, SunData, Vec3, LightsData);

// TODO: add messaging for window creation and resize
impl Plugin for VoxelRenderPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(MainThreadExecutor::new());
        let (world_message_sender, world_message_receiver) = mpsc::channel::<WorldMessage>();
        let (render_finished_sender, render_finished_receiver) = mpsc::channel::<()>();
        let (window_creation_sender, window_creation_receiver) =
            mpsc::channel::<WindowCreationData>();
        let (window_resized_sender, window_resized_receiver) = mpsc::channel::<(u32, u32)>();

        // Kicks off render cycle TODO: check if it causes race at app startup
        render_finished_sender
            .send(())
            .expect("Error sending initial render finished signal");

        let event_loop = EventLoop::new().unwrap();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapter = Arc::new(
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
                .unwrap(),
        );
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE
                | wgpu::Features::MULTI_DRAW_INDIRECT
                | wgpu::Features::ADDRESS_MODE_CLAMP_TO_BORDER,
            ..default()
        }))
        .unwrap();

        let device_arc = Arc::new(device);
        let runner_device_arc = device_arc.clone();
        let render_instance = instance.clone();
        let render_device_arc = device_arc.clone();

        app.set_runner(move |app| {
            winit_runner(
                app,
                event_loop,
                world_message_sender,
                render_finished_receiver,
                window_creation_sender,
                window_resized_sender,
                runner_device_arc,
                instance,
            )
        });

        let render_loop = move || {
            let mut render_app = RenderApp::new(
                render_device_arc,
                queue,
                render_instance,
                window_creation_receiver,
                (800, 600),
                window_resized_receiver,
            );

            match render_app.window_creation_receiver.recv() {
                Ok(WindowCreationData {
                    surface,
                    initial_size,
                }) => {
                    render_app.update_render_targets(initial_size);
                    loop {
                        match world_message_receiver.recv() {
                            Ok(world_messsage) => {
                                let (view_proj, voxel_planes, sun_data, camera_position, lights) =
                                    world_messsage;
                                let (shadow_transform, _) = sun_data;
                                let shadow_view = shadow_transform.compute_matrix().inverse();

                                // Send a signal that the next update can begin
                                render_finished_sender
                                    .send(())
                                    .expect("Failed to send render finished signal");

                                match surface.get_current_texture() {
                                    Ok(surface_texture) => {
                                        // Render the scene
                                        render_app.render(
                                            view_proj,
                                            shadow_view,
                                            voxel_planes,
                                            camera_position,
                                            lights,
                                            surface_texture,
                                        );
                                    }
                                    Err(e) => {
                                        error!("Failed to get current surface texture: {:?}", e);
                                        continue;
                                    }
                                }
                            }
                            Err(_) => {
                                // Channel closed, exit thread
                                info!("World creation message channel closed; exiting render loop");
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to receive window creation data: {:?}", e);
                    return;
                }
            }
        };

        thread::Builder::new()
            .name("Render Thread".to_string())
            .spawn(render_loop)
            .expect("TODO: panic message");
    }
}
