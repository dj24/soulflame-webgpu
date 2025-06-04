use crate::vxm_mesh::{MeshedVoxels, MeshedVoxelsFace};
use bevy::app::PluginsState;
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::prelude::*;
use bevy::render::camera::CameraProjection;
use bytemuck::{Pod, Zeroable};
use std::sync::Arc;
use std::time::{Duration, Instant};
use wgpu::util::DeviceExt;
use wgpu::{
    BindGroup, Buffer, Device, Queue, RenderPipeline, Surface, SurfaceTexture, TextureFormat,
    VertexAttribute, VertexStepMode,
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
    pub(crate) color: [u8; 3],
    pub(crate) height: u8,
}

#[derive(Component, Deref)]
pub struct InstanceMaterialData(pub Arc<Vec<InstanceData>>);

struct RenderState {
    window: Arc<Window>,
    device: Device,
    queue: Queue,
    size: winit::dpi::PhysicalSize<u32>,
    surface: Surface<'static>,
    surface_format: TextureFormat,
    render_pipeline: RenderPipeline,
    debug_quad_render_pipeline: RenderPipeline,
    mvp_buffer: Buffer,
    instance_buffer: Buffer,
    bind_group: BindGroup,
    debug_quad_bind_group: BindGroup,
    depth_texture: wgpu::Texture,
    depth_texture_view: wgpu::TextureView,
    indirect_buffer: Buffer,
}

const BIND_GROUP_LAYOUT_DESCRIPTOR: &wgpu::BindGroupLayoutDescriptor =
    &wgpu::BindGroupLayoutDescriptor {
        label: Some("Bind Group Layout"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: true },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    };

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

impl RenderState {
    fn get_debug_quad_render_pipeline(
        device: &Device,
        surface: &Surface,
        adapter: &wgpu::Adapter,
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

        let swapchain_capabilities = surface.get_capabilities(&adapter);
        let supports_ray_query = adapter
            .features()
            .contains(wgpu::Features::EXPERIMENTAL_RAY_QUERY);
        println!("Ray Query Support: {}", supports_ray_query);

        let supports_multi_draw = adapter
            .features()
            .contains(wgpu::Features::MULTI_DRAW_INDIRECT);

        println!("Multi Draw Support: {}", supports_multi_draw);
        let swapchain_format = swapchain_capabilities.formats[0];

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
                targets: &[Some(swapchain_format.into())],
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

    fn get_render_pipeline(
        device: &Device,
        surface: &Surface,
        adapter: &wgpu::Adapter,
        bind_group_layout: &wgpu::BindGroupLayout,
    ) -> RenderPipeline {
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Vertex Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/shader.wgsl").into()),
        });

        let swapchain_capabilities = surface.get_capabilities(&adapter);
        let swapchain_format = swapchain_capabilities.formats[0];

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[
                    wgpu::VertexBufferLayout {
                        array_stride: size_of::<InstanceData>() as u64,
                        step_mode: VertexStepMode::Instance,
                        attributes: &[
                            VertexAttribute {
                                format: wgpu::VertexFormat::Uint32,
                                offset: 0,
                                shader_location: 0,
                            },
                            VertexAttribute {
                                format: wgpu::VertexFormat::Uint32,
                                offset: wgpu::VertexFormat::Uint32.size(),
                                shader_location: 1,
                            },
                        ],
                    },
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<u32>() as u64, // vec3<f32>
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Uint32,
                            offset: 0,
                            shader_location: 2, // position in shader
                        }],
                    },
                ],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(swapchain_format.into())],
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: None,
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                front_face: wgpu::FrontFace::Ccw,
                ..default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: TextureFormat::Depth24Plus,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Greater,
                stencil: wgpu::StencilState::default(), // 2.
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        render_pipeline
    }

    async fn new(window: Arc<Window>) -> RenderState {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions::default())
            .await
            .unwrap();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE
                    | wgpu::Features::MULTI_DRAW_INDIRECT,
                ..default()
            })
            .await
            .unwrap();

        let size = window.inner_size();

        let surface = instance.create_surface(window.clone()).unwrap();
        let cap = surface.get_capabilities(&adapter);
        let surface_format = cap.formats[0];

        let debug_quad_bind_group_layout =
            device.create_bind_group_layout(DEBUG_DEPTH_BIND_GROUP_LAYOUT_DESCRIPTOR);

        let instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("instance data buffer"),
            size: (size_of::<InstanceData>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Indirect Draw Buffer"),
            size: (size_of::<wgpu::util::DrawIndirectArgs>() * 6) as u64, // 6 faces per voxel
            usage: wgpu::BufferUsages::INDIRECT | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mvp_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("MVP Buffer"),
            size: size_of::<Mat4>() as u64, // 2 matrices for model and view projection
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = device.create_bind_group_layout(BIND_GROUP_LAYOUT_DESCRIPTOR);

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: mvp_buffer.as_entire_binding(),
            }],
        });

        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Depth Texture"),
            size: wgpu::Extent3d {
                width: size.width,
                height: size.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let depth_texture_view = depth_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Depth Texture View"),
            format: Some(wgpu::TextureFormat::Depth24Plus),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
        });

        let debug_quad_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Debug Quad Bind Group"),
            layout: &debug_quad_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&depth_texture_view),
            }],
        });

        let render_pipeline =
            Self::get_render_pipeline(&device, &surface, &adapter, &bind_group_layout);

        let debug_quad_render_pipeline = Self::get_debug_quad_render_pipeline(
            &device,
            &surface,
            &adapter,
            &debug_quad_bind_group_layout,
        );

        let state = RenderState {
            window,
            device,
            queue,
            size,
            surface,
            surface_format,
            render_pipeline,
            debug_quad_render_pipeline,
            debug_quad_bind_group,
            bind_group,
            instance_buffer,
            mvp_buffer,
            depth_texture,
            depth_texture_view,
            indirect_buffer,
        };

        // Configure surface for the first time
        state.configure_surface();

        state
    }

    fn get_window(&self) -> &Window {
        &self.window
    }

    fn configure_surface(&self) {
        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: self.surface_format,
            // Request compatibility with the sRGB-format texture view we‘re going to create later.
            view_formats: vec![self.surface_format.add_srgb_suffix()],
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            width: self.size.width,
            height: self.size.height,
            desired_maximum_frame_latency: 2,
            present_mode: wgpu::PresentMode::Immediate,
        };
        self.surface.configure(&self.device, &surface_config);
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        self.size = new_size;

        // reconfigure the surface
        self.configure_surface();
    }

    fn get_surface_texture(&self) -> SurfaceTexture {
        self.surface
            .get_current_texture()
            .expect("failed to acquire next swapchain texture")
    }

    fn get_texture_view(&self, surface_texture: &SurfaceTexture) -> wgpu::TextureView {
        surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor {
                format: Some(self.surface_format.add_srgb_suffix()),
                ..Default::default()
            })
    }

    fn get_view_projection_matrix(&mut self, mut world: &mut World) -> Mat4 {
        let mut camera = world.query::<(&mut Projection, &GlobalTransform)>();
        let (mut projection, transform) = camera.iter_mut(&mut world).next().unwrap();
        match &mut *projection {
            Projection::Perspective(perspective) => {
                perspective.update(self.size.width as f32, self.size.height as f32);
            }
            Projection::Orthographic(p) => {
                panic!("Orthographic projection not supported");
            }
            Projection::Custom(p) => {
                panic!("Custom projection not supported");
            }
        }

        let view_matrix = transform.compute_matrix().inverse();
        let projection_matrix = projection.get_clip_from_view();
        projection_matrix * view_matrix
    }

    fn render(&mut self, mut world: &mut World) {
        let surface_texture = self.get_surface_texture();
        let texture_view = self.get_texture_view(&surface_texture);

        // Get each voxel entity
        let mut query = world.query::<(&Children, &Transform, &MeshedVoxels)>();

        // Get face data for each voxel entity
        let mut child_query = world.query::<(&MeshedVoxelsFace, &InstanceMaterialData)>();

        let view_proj = self.get_view_projection_matrix(world);

        let voxel_object_count = query.iter(world).count();
        let new_buffer_size = (voxel_object_count * size_of::<Mat4>()) as u64;

        let mut total_instances = 0;

        let mut all_vertex_data: Vec<u32> = Vec::with_capacity(24 * voxel_object_count);
        let mut all_mvp_data: Vec<Mat4> = Vec::with_capacity(voxel_object_count);
        let mut all_indirect_data: Vec<wgpu::util::DrawIndirectArgs> =
            Vec::with_capacity(total_instances as usize);

        // Populate MVP matrices and vertex data for each voxel entity, and count total instances
        for (index, (children, transform, _)) in query.iter(world).enumerate() {
            all_mvp_data.push(view_proj * transform.compute_matrix());
            all_vertex_data.extend((0..24).map(|_| index as u32).collect::<Vec<u32>>());
            let first_vertex = index as u32 * 24;

            for (_, child) in children.iter().enumerate() {
                let (face, instance_data) = child_query.get(world, child).unwrap();
                let face_index: u32 = match face {
                    MeshedVoxelsFace::Back => 0,
                    MeshedVoxelsFace::Front => 1,
                    MeshedVoxelsFace::Left => 2,
                    MeshedVoxelsFace::Right => 3,
                    MeshedVoxelsFace::Bottom => 4,
                    MeshedVoxelsFace::Top => 5,
                };
                let instance_count = instance_data.len() as u32;
                all_indirect_data.push(wgpu::util::DrawIndirectArgs {
                    vertex_count: 4, // Each face has 4 vertices
                    instance_count,
                    first_vertex: first_vertex + face_index * 4,
                    first_instance: total_instances,
                });
                total_instances += instance_count;
            }
        }

        let mut encoder = self.device.create_command_encoder(&Default::default());
        let mut renderpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &texture_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.depth_texture_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(0.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        let voxel_object_count = query.iter(world).count();

        // Write all indirect data to the GPU buffer
        {
            let indirect_buffer_size =
                (size_of::<wgpu::util::DrawIndirectArgs>() * 6 * voxel_object_count) as u64;
            // If indirect buffer is too small, resize it
            if self.indirect_buffer.size() != indirect_buffer_size {
                self.indirect_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("Indirect Draw Buffer"),
                    size: indirect_buffer_size,
                    usage: wgpu::BufferUsages::INDIRECT | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
            }
            self.queue.write_buffer(
                &self.indirect_buffer,
                0,
                bytemuck::cast_slice(&all_indirect_data),
            );
        }

        // Write all vertex data to the GPU buffer
        {
            // Vertex buffer used to store model indices
            let vertex_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Vertex Buffer"),
                size: (size_of::<u32>() * 24 * voxel_object_count).max(size_of::<u32>() * 24)
                    as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.queue
                .write_buffer(&vertex_buffer, 0, bytemuck::cast_slice(&all_vertex_data));
            renderpass.set_vertex_buffer(1, vertex_buffer.slice(..));
        }

        // Write all MVP matrices to the GPU buffer
        {
            // If storage buffer is too small, resize it
            if self.mvp_buffer.size() < new_buffer_size {
                info!(
                    "Resizing MVP buffer from {} to {}",
                    self.mvp_buffer.size(),
                    new_buffer_size
                );
                self.mvp_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("MVP Buffer"),
                    size: new_buffer_size,
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
            }
            self.queue
                .write_buffer(&self.mvp_buffer, 0, bytemuck::cast_slice(&all_mvp_data));
        }

        // Collect all instance data from the children of each voxel entity
        {
            let total_instance_buffer_size =
                (total_instances * size_of::<InstanceData>() as u32) as u64;

            // Only update the instance buffer if its size has changed
            if self.instance_buffer.size() != total_instance_buffer_size {
                let mut all_instance_data: Vec<InstanceData> =
                    Vec::with_capacity(total_instances as usize);
                self.instance_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("instance data buffer"),
                    size: total_instance_buffer_size.max(size_of::<InstanceData>() as u64),
                    usage: wgpu::BufferUsages::VERTEX
                        | wgpu::BufferUsages::COPY_DST
                        | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                });

                for (_, (children, _, _)) in query.iter(world).enumerate() {
                    for child in children.iter() {
                        let (_, instance_data) = child_query.get(world, child).unwrap();
                        all_instance_data.extend(instance_data.iter());
                    }
                }
                // Write all instance data to the GPU buffer
                self.queue.write_buffer(
                    &self.instance_buffer,
                    0,
                    bytemuck::cast_slice(&all_instance_data),
                );
            }

            renderpass.set_vertex_buffer(0, self.instance_buffer.slice(..));
        }

        renderpass.set_pipeline(&self.render_pipeline);

        // Create and set bind group with the updated MVP buffer
        {
            self.bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Bind Group"),
                layout: &self
                    .device
                    .create_bind_group_layout(BIND_GROUP_LAYOUT_DESCRIPTOR),
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.mvp_buffer.as_entire_binding(),
                }],
            });
            renderpass.set_bind_group(0, &self.bind_group, &[]);
        }

        let entity_count = query.iter(world).count();

        if entity_count > 0 {
            // Calculate total number of draw commands (6 faces per entity)
            let total_draws = entity_count * 6;

            // Single multi_draw_indirect call for all entities
            renderpass.multi_draw_indirect(
                &self.indirect_buffer,
                0, // Start at beginning of buffer
                total_draws as u32,
            );
        }

        drop(renderpass);

        // Debug depth
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

        self.queue
            .submit([encoder.finish(), depth_debug_encoder.finish()]);
        self.window.pre_present_notify();
        surface_texture.present();
    }
}

#[derive(Default)]
struct VoxelRenderApp {
    state: Option<RenderState>,
    app: App,
    // FPS tracking fields
    last_fps_instant: Option<Instant>,
    frame_count: u32,
}

impl VoxelRenderApp {
    fn new(app: App) -> Self {
        Self {
            state: None,
            app,
            last_fps_instant: Some(Instant::now()),
            frame_count: 0,
        }
    }
}

impl ApplicationHandler for VoxelRenderApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        // Create window object
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_inner_size(winit::dpi::PhysicalSize::new(2560, 1440)),
                )
                .unwrap(),
        );

        let state = pollster::block_on(RenderState::new(window.clone()));
        self.state = Some(state);

        window.request_redraw();
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        let state = self.state.as_mut().unwrap();
        match event {
            WindowEvent::CloseRequested => {
                println!("The close button was pressed; stopping");
                event_loop.exit();
            }
            WindowEvent::RedrawRequested => {
                self.app.update();
                let mut world = self.app.world_mut();
                state.render(world);

                // FPS tracking logic
                self.frame_count += 1;
                let now = Instant::now();
                if let Some(last) = self.last_fps_instant {
                    if now.duration_since(last) >= Duration::from_secs(1) {
                        println!("FPS: {}", self.frame_count);
                        self.frame_count = 0;
                        self.last_fps_instant = Some(now);
                    }
                } else {
                    self.last_fps_instant = Some(now);
                }

                // Emits a new redraw requested event.
                state.get_window().request_redraw();
            }
            WindowEvent::Resized(size) => {
                // Reconfigures the size of the surface. We do not re-render
                // here as this event is always followed up by redraw request.
                state.resize(size);
            }
            _ => (),
        }
    }
}

pub fn winit_runner(mut app: App) -> AppExit {
    let event_loop = EventLoop::new().unwrap();

    if app.plugins_state() == PluginsState::Ready {
        app.finish();
        app.cleanup();
    }

    let mut render_app = VoxelRenderApp::new(app);

    event_loop
        .run_app(&mut render_app)
        .expect("Event loop panicked");

    AppExit::Success
}

pub struct VoxelRenderPlugin;

impl Plugin for VoxelRenderPlugin {
    fn build(&self, app: &mut App) {
        app.set_runner(|app| winit_runner(app));
        app.insert_resource(MainThreadExecutor::new());
    }
}
