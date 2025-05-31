use crate::custom_shader_instancing::{InstanceData, InstanceMaterialData};
use crate::vxm_mesh::MeshedVoxelsFace;
use bevy::app::PluginsState;
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::prelude::*;
use bevy::render::camera::CameraProjection;
use std::sync::Arc;
use wgpu::{
    BindGroup, Buffer, Device, Queue, RenderPipeline, Surface, TextureFormat, VertexAttribute,
    VertexStepMode,
};
use winit::{
    application::ApplicationHandler,
    event::WindowEvent,
    event_loop::{ActiveEventLoop, EventLoop},
    window::{Window, WindowId},
};

struct RenderState {
    window: Arc<Window>,
    device: Device,
    queue: Queue,
    size: winit::dpi::PhysicalSize<u32>,
    surface: Surface<'static>,
    surface_format: TextureFormat,
    render_pipeline: RenderPipeline,
    uniform_buffer: Buffer,
    instance_buffer: Buffer,
    bind_group: BindGroup,
}

impl RenderState {
    async fn new(window: Arc<Window>) -> RenderState {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions::default())
            .await
            .unwrap();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .unwrap();

        let size = window.inner_size();

        let surface = instance.create_surface(window.clone()).unwrap();
        let cap = surface.get_capabilities(&adapter);
        let surface_format = cap.formats[0];

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Bind Group Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        // Resize in render
        let instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("instance data buffer"),
            size: (size_of::<InstanceData>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Uniform Buffer"),
            size: size_of::<Mat4>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

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
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: size_of::<InstanceData>() as u64,
                    step_mode: VertexStepMode::Instance,
                    attributes: &[
                        VertexAttribute {
                            format: wgpu::VertexFormat::Uint32,
                            offset: 0,
                            shader_location: 0, // shader locations 0-2 are taken up by Position, Normal and UV attributes
                        },
                        VertexAttribute {
                            format: wgpu::VertexFormat::Uint32,
                            offset: wgpu::VertexFormat::Uint32.size(),
                            shader_location: 1,
                        },
                    ],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(swapchain_format.into())],
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: Some(wgpu::Face::Back),
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                front_face: wgpu::FrontFace::Ccw,
                ..default()
            },
            depth_stencil: None,
            // depth_stencil: Some(wgpu::DepthStencilState {
            //     format: TextureFormat::Depth32Float,
            //     depth_write_enabled: true,
            //     depth_compare: wgpu::CompareFunction::Less,
            //     stencil: wgpu::StencilState::default(), // 2.
            //     bias: wgpu::DepthBiasState::default(),
            // }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let state = RenderState {
            window,
            device,
            queue,
            size,
            surface,
            surface_format,
            render_pipeline,
            uniform_buffer,
            bind_group,
            instance_buffer,
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
            present_mode: wgpu::PresentMode::AutoVsync,
        };
        self.surface.configure(&self.device, &surface_config);
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        self.size = new_size;

        // reconfigure the surface
        self.configure_surface();
    }

    fn render(&mut self, mut world: &mut World) {
        // Create texture view
        let surface_texture = self
            .surface
            .get_current_texture()
            .expect("failed to acquire next swapchain texture");

        let texture_view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor {
                // Without add_srgb_suffix() the image we will be working with
                // might not be "gamma correct".
                format: Some(self.surface_format.add_srgb_suffix()),
                ..Default::default()
            });

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
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        renderpass.set_pipeline(&self.render_pipeline);

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
        let view_proj = projection_matrix * view_matrix;

        let mut query =
            world.query::<(&MeshedVoxelsFace, &InstanceMaterialData, &GlobalTransform)>();

        for (face, instance_data, transform) in query.iter(&mut world) {
            let model_view_proj = view_proj * transform.compute_matrix();
            self.queue.write_buffer(
                &self.uniform_buffer,
                0,
                bytemuck::cast_slice(&model_view_proj.to_cols_array_2d()),
            );
            let instance_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("instance data buffer"),
                size: (instance_data.len() * size_of::<InstanceData>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });

            // Write instance data to the GPU buffer
            self.queue
                .write_buffer(&instance_buffer, 0, bytemuck::cast_slice(&instance_data));

            renderpass.set_bind_group(0, &self.bind_group, &[]);
            renderpass.set_vertex_buffer(0, instance_buffer.slice(..));
            
            let instance_count = instance_data.len() as u32;

            match face {
                MeshedVoxelsFace::Back => {
                    renderpass.draw(0..4, 0..instance_count);
                }
                MeshedVoxelsFace::Front => {
                    renderpass.draw(4..8, 0..instance_count);
                }
                MeshedVoxelsFace::Left => {
                    renderpass.draw(8..12, 0..instance_count);
                }
                MeshedVoxelsFace::Right => {
                    renderpass.draw(12..16, 0..instance_count);
                }
                MeshedVoxelsFace::Bottom => {
                    renderpass.draw(16..20, 0..instance_count);
                }
                MeshedVoxelsFace::Top => {
                    renderpass.draw(20..24, 0..instance_count);
                }
            }
        }

        drop(renderpass);
        self.queue.submit([encoder.finish()]);

        self.window.pre_present_notify();
        surface_texture.present();
    }
}

#[derive(Default)]
struct VoxelRenderApp {
    state: Option<RenderState>,
    app: App,
}

impl VoxelRenderApp {
    fn new(app: App) -> Self {
        Self { state: None, app }
    }
}

impl ApplicationHandler for VoxelRenderApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        // Create window object
        let window = Arc::new(
            event_loop
                .create_window(Window::default_attributes().with_maximized(true))
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
