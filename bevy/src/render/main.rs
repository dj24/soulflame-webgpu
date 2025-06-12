use crate::vxm_mesh::MeshedVoxelsFace;
use bevy::app::PluginsState;
use bevy::asset::io::memory::Dir;
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::prelude::*;
use bevy::render::camera::CameraProjection;
use bytemuck::{Pod, Zeroable};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{mpsc, Arc};
use std::thread;
use wgpu::{
    BindGroup, Buffer, Device, Queue, RenderPipeline, Surface, SurfaceTexture, TextureFormat,
    TextureView, VertexAttribute, VertexStepMode,
};
use winit::keyboard::Key;
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

#[derive(Component, Deref, Clone)]
pub struct InstanceMaterialData(pub Arc<Vec<InstanceData>>);

struct RenderState {
    window: Arc<Window>,
    device: Device,
    queue: Queue,
    size: winit::dpi::PhysicalSize<u32>,
    surface: Arc<Surface<'static>>,
    surface_format: TextureFormat,
    render_pipeline: RenderPipeline,
    debug_quad_render_pipeline: RenderPipeline,
    shadow_render_pipeline: RenderPipeline,
    mvp_buffer: Buffer,
    instance_buffer: Buffer,
    bind_group: BindGroup,
    debug_quad_bind_group: BindGroup,
    shadow_bind_group: BindGroup,
    depth_texture_view: wgpu::TextureView,
    indirect_buffer: Buffer,
    view_projection_buffer: Buffer,
    shadow_projection_buffer: Buffer,
    shadow_map_texture_view: wgpu::TextureView,
    vertex_buffer: Buffer,
}

const BIND_GROUP_LAYOUT_DESCRIPTOR: &wgpu::BindGroupLayoutDescriptor =
    &wgpu::BindGroupLayoutDescriptor {
        label: Some("Bind Group Layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    };

// Shadow map view, sampler, and light view projection matrix
const SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR: &wgpu::BindGroupLayoutDescriptor =
    &wgpu::BindGroupLayoutDescriptor {
        label: Some("Shadow Bind Group Layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Depth,
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
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

    fn get_shadow_render_pipeline(
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
            fragment: None,
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
        shadow_bind_group_layout: &wgpu::BindGroupLayout,
    ) -> RenderPipeline {
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_group_layout, shadow_bind_group_layout],
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

    fn new(
        window: Arc<Window>,
        surface: Arc<Surface<'static>>,
        adapter: Arc<wgpu::Adapter>,
    ) -> RenderState {
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE
                | wgpu::Features::MULTI_DRAW_INDIRECT
                | wgpu::Features::ADDRESS_MODE_CLAMP_TO_BORDER,
            ..default()
        }))
        .unwrap();

        let size = window.inner_size();
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

        let matrix_init_descriptor = wgpu::BufferDescriptor {
            label: Some("Matrix Initialization Buffer"),
            size: size_of::<Mat4>() as u64, // 1 matrix for view projection
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        };

        let view_projection_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("View Projection Buffer"),
            ..matrix_init_descriptor
        });

        let shadow_projection_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Shadow Projection Buffer"),
            ..matrix_init_descriptor
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bind Group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: mvp_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: view_projection_buffer.as_entire_binding(),
                },
            ],
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

        let shadow_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shadow Map Texture"),
            size: wgpu::Extent3d {
                width: 2048,
                height: 2048,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let shadow_map_texture_view = shadow_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Shadow Map Texture View"),
            format: Some(wgpu::TextureFormat::Depth24Plus),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
        });

        let shadow_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Shadow Map Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToBorder,
            address_mode_v: wgpu::AddressMode::ClampToBorder,
            address_mode_w: wgpu::AddressMode::ClampToBorder,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::FilterMode::Nearest,
            lod_min_clamp: 0.0,
            lod_max_clamp: 1.0,
            compare: Some(wgpu::CompareFunction::Greater),
            anisotropy_clamp: 1,
            border_color: None,
        });

        let shadow_bind_group_layout =
            device.create_bind_group_layout(SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR);

        let shadow_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Shadow Bind Group"),
            layout: &shadow_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&shadow_map_texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&shadow_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: shadow_projection_buffer.as_entire_binding(),
                },
            ],
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
                resource: wgpu::BindingResource::TextureView(&shadow_map_texture_view),
            }],
        });

        let render_pipeline = Self::get_render_pipeline(
            &device,
            &surface,
            &adapter,
            &bind_group_layout,
            &shadow_bind_group_layout,
        );

        let shadow_render_pipeline =
            Self::get_shadow_render_pipeline(&device, &surface, &adapter, &bind_group_layout);

        let debug_quad_render_pipeline = Self::get_debug_quad_render_pipeline(
            &device,
            &surface,
            &adapter,
            &debug_quad_bind_group_layout,
        );

        let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Vertex Buffer"),
            size: (size_of::<u32>() * 24) as u64, // 6 faces * 4 vertices per face
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

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
            depth_texture_view,
            indirect_buffer,
            shadow_map_texture_view,
            vertex_buffer,
            view_projection_buffer,
            shadow_projection_buffer,
            shadow_render_pipeline,
            shadow_bind_group,
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

    fn configure_depth_texture(&mut self) {
        let depth_texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Depth Texture"),
            size: wgpu::Extent3d {
                width: self.size.width,
                height: self.size.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        self.depth_texture_view = depth_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Depth Texture View"),
            format: Some(wgpu::TextureFormat::Depth24Plus),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
        });
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        self.size = new_size;
        self.configure_depth_texture();
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

    fn enqueue_depth_debug_pass(&mut self, texture_view: TextureView) -> wgpu::CommandBuffer {
        let depth_span = info_span!("Depth Debug").entered();
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
        depth_span.exit();
        depth_debug_encoder.finish()
    }

    fn prepare_buffers(&mut self, voxel_planes: VoxelPlanesData) {
        let voxel_object_count = voxel_planes.len() / 6;
        let new_buffer_size = (voxel_object_count * size_of::<Mat4>()) as u64;
        let mut total_instances = 0;

        let mut all_vertex_data: Vec<u32> = Vec::with_capacity(24 * voxel_object_count);
        let mut all_mvp_data: Vec<Mat4> = Vec::with_capacity(voxel_object_count);
        let mut all_indirect_data: Vec<wgpu::util::DrawIndirectArgs> =
            Vec::with_capacity(total_instances as usize);
        let mut all_instance_data: Vec<InstanceData> = Vec::new();

        // Pre-allocate memory based on input size
        let face_count = voxel_planes.len();
        let voxel_count = (face_count + 5) / 6; // Ceiling division by 6

        // Pre-allocate all vectors with appropriate capacity
        all_mvp_data.reserve(voxel_count);
        all_vertex_data.reserve(voxel_count * 24);
        all_indirect_data.reserve(face_count);

        // Estimate total instance count to avoid reallocations
        let est_total_instances = voxel_planes
            .iter()
            .map(|(_, data, _, _)| data.len())
            .sum::<usize>();
        all_instance_data.reserve(est_total_instances);

        // Populate MVP matrices and vertex data for each voxel entity, and count total instances
        let mut first_vertex = 0;

        let populate_buffers_span = info_span!("Populate buffers").entered();

        {
            for (index, (face, instance_data, transform, _)) in voxel_planes.into_iter().enumerate()
            {
                // if !visibility.get() {
                //     // Skip invisible entities
                //     continue;
                // }
                // Each voxel entity has 6 faces, so we store one transform for each 6
                if (index % 6) == 0 {
                    let mvp_index = index / 6;
                    all_mvp_data.push(transform.compute_matrix());
                    for _ in 0..24 {
                        all_vertex_data.push(mvp_index as u32);
                    }
                    first_vertex = mvp_index as u32 * 24;
                }

                let face_index = face as u32;
                let instance_count = instance_data.len() as u32;
                all_indirect_data.push(wgpu::util::DrawIndirectArgs {
                    vertex_count: 4, // Each face has 4 vertices
                    instance_count,
                    first_vertex: first_vertex + face_index * 4,
                    first_instance: total_instances,
                });
                all_instance_data.extend_from_slice(&instance_data);
                total_instances += instance_count;
            }
        }

        populate_buffers_span.exit();

        let gpu_upload_span = info_span!("GPU Upload").entered();

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
            self.vertex_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Vertex Buffer"),
                size: (size_of::<u32>() * 24 * voxel_object_count).max(size_of::<u32>() * 24)
                    as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.queue.write_buffer(
                &self.vertex_buffer,
                0,
                bytemuck::cast_slice(&all_vertex_data),
            );
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
            self.bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Bind Group"),
                layout: &self
                    .device
                    .create_bind_group_layout(BIND_GROUP_LAYOUT_DESCRIPTOR),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.mvp_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.view_projection_buffer.as_entire_binding(),
                    },
                ],
            });
        }

        // Collect all instance data from the children of each voxel entity
        {
            let total_instance_buffer_size =
                (all_instance_data.len() * size_of::<InstanceData>()) as u64;

            // Only update the instance buffer if its size has changed
            if self.instance_buffer.size() != total_instance_buffer_size {
                self.instance_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("instance data buffer"),
                    size: total_instance_buffer_size.max(size_of::<InstanceData>() as u64),
                    usage: wgpu::BufferUsages::VERTEX
                        | wgpu::BufferUsages::COPY_DST
                        | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                });

                // Write all instance data to the GPU buffer
                self.queue.write_buffer(
                    &self.instance_buffer,
                    0,
                    bytemuck::cast_slice(&all_instance_data),
                );
            }
        }

        gpu_upload_span.exit();
    }

    fn enqueue_main_pass(
        &mut self,
        texture_view: TextureView,
        draw_count: u32,
    ) -> wgpu::CommandBuffer {
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

        renderpass.set_vertex_buffer(1, self.vertex_buffer.slice(..));
        renderpass.set_vertex_buffer(0, self.instance_buffer.slice(..));
        renderpass.set_pipeline(&self.render_pipeline);
        renderpass.set_bind_group(0, &self.bind_group, &[]);
        renderpass.set_bind_group(1, &self.shadow_bind_group, &[]);

        // Single multi_draw_indirect call for all entities
        renderpass.multi_draw_indirect(
            &self.indirect_buffer,
            0, // Start at beginning of buffer
            draw_count,
        );
        drop(renderpass);
        encoder.finish()
    }

    fn enqueue_shadow_pass(&mut self, total_draws: u32) -> wgpu::CommandBuffer {
        let mut encoder = self.device.create_command_encoder(&Default::default());
        let mut renderpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.shadow_map_texture_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(0.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        renderpass.set_pipeline(&self.shadow_render_pipeline);
        renderpass.set_vertex_buffer(1, self.vertex_buffer.slice(..));
        renderpass.set_vertex_buffer(0, self.instance_buffer.slice(..));
        renderpass.set_bind_group(0, &self.bind_group, &[]);

        let draw_span = info_span!("Draw Commands").entered();

        // Single multi_draw_indirect call for all entities
        renderpass.multi_draw_indirect(
            &self.indirect_buffer,
            0, // Start at beginning of buffer
            total_draws as u32,
        );

        drop(renderpass);
        draw_span.exit();
        encoder.finish()
    }

    fn render(&mut self, view_proj: Mat4, shadow_view_proj: Mat4, voxel_planes: VoxelPlanesData) {
        let render_span = info_span!("Voxel render").entered();
        let surface_texture = self.get_surface_texture();
        let texture_view = self.get_texture_view(&surface_texture);
        let draw_count = voxel_planes.len() as u32;

        // Prepare buffers for the main pass
        self.prepare_buffers(voxel_planes);

        // Shadow
        {
            self.queue.write_buffer(
                &self.shadow_projection_buffer,
                0,
                bytemuck::cast_slice(&[shadow_view_proj]),
            );
            self.queue.write_buffer(
                &self.view_projection_buffer,
                0,
                bytemuck::cast_slice(&[shadow_view_proj]),
            );
            let shadow_pass_command_buffer = self.enqueue_shadow_pass(draw_count);
            self.queue.submit([shadow_pass_command_buffer]);
        }

        // Main pass
        {
            self.queue.write_buffer(
                &self.view_projection_buffer,
                0,
                bytemuck::cast_slice(&[view_proj]),
            );
            let main_pass_command_buffer = self.enqueue_main_pass(texture_view, draw_count);

            let texture_view = self.get_texture_view(&surface_texture);
            let depth_debug_command_buffer = self.enqueue_depth_debug_pass(texture_view);

            let submit_span = info_span!("Submit Commands").entered();
            self.queue
                .submit([main_pass_command_buffer, depth_debug_command_buffer]);
            submit_span.exit();
        }

        self.window.pre_present_notify();
        surface_texture.present();
        render_span.exit();
    }
}

fn get_view_projection_matrix(projection: &Projection, transform: &GlobalTransform) -> Mat4 {
    let view_matrix = transform.compute_matrix().inverse();
    let projection_matrix = projection.get_clip_from_view();
    projection_matrix * view_matrix
}

struct VoxelExtractApp {
    world_message_sender: Sender<WorldMessage>,
    app: App,
    window: Arc<Window>,
    render_finished_receiver: Receiver<()>,
}

impl VoxelExtractApp {
    fn new(
        world_message_sender: Sender<WorldMessage>,
        app: App,
        window: Arc<Window>,
        render_finished_receiver: Receiver<()>,
    ) -> Self {
        Self {
            world_message_sender,
            app,
            window,
            render_finished_receiver,
        }
    }
}

impl ApplicationHandler for VoxelExtractApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        let _ = &self.window.request_redraw();
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::Destroyed => {
                println!("Window destroyed; stopping");
                event_loop.exit();
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if let Key::Named(winit::keyboard::NamedKey::Escape) = event.logical_key {
                    if event.state.is_pressed() {
                        event_loop.exit();
                    }
                }
            }
            WindowEvent::CloseRequested => {
                println!("The close button was pressed; stopping");
                event_loop.exit();
            }
            WindowEvent::Resized(size) => {
                info!("Resizing to {:?}", size);
            }
            WindowEvent::RedrawRequested => {
                match self.render_finished_receiver.try_recv() {
                    Ok(message) => {
                        self.app.update();

                        // Get camera view projection matrix
                        let world = self.app.world_mut();
                        let mut camera = world.query::<(&mut Projection, &GlobalTransform)>();
                        let (projection, global_transform) = camera.iter_mut(world).next().unwrap();
                        let view_proj = get_view_projection_matrix(&projection, global_transform);

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

                        self.world_message_sender
                            .send((view_proj, voxel_entities, sun_data))
                            .expect("Error sending voxel data to render thread");

                        let size = self.window.inner_size();
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
                    }
                    Err(mpsc::TryRecvError::Empty) => {}
                    Err(mpsc::TryRecvError::Disconnected) => {
                        event_loop.exit();
                    }
                }

                // Emits a new redraw requested event.
                let _ = &self.window.request_redraw();
            }
            _ => (),
        }
    }
}

pub fn winit_runner(
    mut app: App,
    window: Arc<Window>,
    event_loop: EventLoop<()>,
    world_message_sender: Sender<WorldMessage>,
    render_finished_receiver: Receiver<()>,
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
        window.clone(),
        render_finished_receiver,
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

pub type WorldMessage = (Mat4, VoxelPlanesData, SunData);

impl Plugin for VoxelRenderPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(MainThreadExecutor::new());
        let (world_message_sender, world_message_receiver) =
            std::sync::mpsc::channel::<WorldMessage>();
        let (render_finished_sender, render_finished_receiver) = std::sync::mpsc::channel::<()>();
        render_finished_sender
            .send(())
            .expect("Error sending initial render finished signal");

        let event_loop = EventLoop::new().unwrap();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapter = Arc::new(
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
                .unwrap(),
        );
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_inner_size(winit::dpi::LogicalSize::new(1920, 1080)),
                )
                .unwrap(),
        );

        let surface = Arc::new(instance.create_surface(window.clone()).unwrap());

        let winit_window = window.clone();

        app.set_runner(|app| {
            winit_runner(
                app,
                winit_window,
                event_loop,
                world_message_sender,
                render_finished_receiver,
            )
        });

        let render_window = window.clone();
        let render_surface = surface.clone();
        let render_adapter = adapter.clone();

        let render_loop = move || {
            let mut render_state = RenderState::new(render_window, render_surface, render_adapter);
            loop {
                // Block until a message is received
                if let Ok((view_proj, voxel_planes, sun_data)) = world_message_receiver.recv() {
                    let (shadow_transform, _) = sun_data;

                    let size = 128.0;

                    let position = Vec2::new(0.0, 16.0);

                    let shadow_view_proj = get_view_projection_matrix(
                        &Projection::Orthographic(OrthographicProjection {
                            near: -1000.0,
                            far: 1000.0,
                            viewport_origin: Default::default(),
                            scaling_mode: Default::default(),
                            scale: 1.0,
                            area: Rect {
                                min: position + Vec2::new(-size, -size),
                                max: position + Vec2::new(size, size),
                            },
                        }),
                        &shadow_transform,
                    );

                    // Send a signal that the next update can begin
                    render_finished_sender
                        .send(())
                        .expect("Failed to send render finished signal");
                    render_state.render(view_proj, shadow_view_proj, voxel_planes);
                } else {
                    // Channel closed, exit thread
                    break;
                }
            }
        };

        thread::Builder::new()
            .name("Render Thread".to_string())
            .spawn(render_loop)
            .expect("TODO: panic message");
    }
}
