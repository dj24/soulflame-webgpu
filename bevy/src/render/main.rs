use crate::keyboard_events::{KeyPressedEvent, KeyReleasedEvent};
use crate::render::shadow::{ShadowRenderPass, SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR};
use crate::render::util::get_view_projection_matrix;
use crate::vxm_mesh::MeshedVoxelsFace;
use bevy::app::PluginsState;
use bevy::asset::io::memory::Dir;
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::math::primitives::Cuboid;
use bevy::prelude::GamepadButton::C;
use bevy::prelude::*;
use bevy::render::camera::CameraProjection;
use bytemuck::{Pod, Zeroable};
use std::mem::size_of;
use std::num::NonZeroU32;
use std::ops::Range;
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{mpsc, Arc};
use std::thread;
use bevy::ecs::error::info;
use wgpu::util::DeviceExt;
use wgpu::{BindGroup, BindGroupLayout, Buffer, Device, Face, Queue, RenderPipeline, Surface, SurfaceTexture, TexelCopyTextureInfo, TextureFormat, TextureView, VertexAttribute, VertexStepMode};
use winit::dpi::PhysicalSize;
use winit::event::ElementState;
use winit::keyboard::{Key, SmolStr};
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

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
struct WireframeVertex {
    position: [f32; 3],
    color: [f32; 4],
}

#[derive(Component, Deref, Clone)]
pub struct InstanceMaterialData(pub Arc<Vec<InstanceData>>);

const LIGHT_COUNT: usize = 32;

struct RenderState {
    window: Arc<Window>,
    device: Device,
    queue: Queue,
    size: PhysicalSize<u32>,
    surface: Arc<Surface<'static>>,
    surface_format: TextureFormat,
    render_pipeline: RenderPipeline,
    debug_quad_render_pipeline: RenderPipeline,
    debug_quad_bind_group: BindGroup,
    main_pass_texture_view: TextureView,
    wireframe_pipeline: RenderPipeline,
    main_pass: MainRenderPass,
    shadow_pass: ShadowRenderPass,
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

// Define NDC corners for the frustum (both near and far)
const NEAR_CORNERS_CLIP: [Vec4; 4] = [
    // Near corners
    Vec4::new(-1.0, -1.0, 0.0, 1.0),
    Vec4::new(1.0, -1.0, 0.0, 1.0),
    Vec4::new(1.0, 1.0, 0.0, 1.0),
    Vec4::new(-1.0, 1.0, 0.0, 1.0),
];

const FAR_CORNERS_CLIP: [Vec4; 4] = [
    // Far corners
    Vec4::new(-1.0, -1.0, 1.0, 1.0),
    Vec4::new(1.0, -1.0, 1.0, 1.0),
    Vec4::new(1.0, 1.0, 1.0, 1.0),
    Vec4::new(-1.0, 1.0, 1.0, 1.0),
];

const NDC_VIEW_SPACE_CORNER_DIRECTIONS: [Vec3; 4] = [
    Vec3::new(-1.0, -1.0, 1.0), // Near bottom left
    Vec3::new(1.0, -1.0, 1.0),  // Near bottom right
    Vec3::new(1.0, 1.0, 1.0),   // Near top right
    Vec3::new(-1.0, 1.0, 1.0),  // Near top left
];

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
pub struct Uniforms {
    pub view_proj: Mat4,
    pub camera_position: Vec4,
}

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
struct GPUPointLight {
    color: Vec3,
    range: f32,
    position: Vec3,
    intensity: f32,
}

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
struct LightsUniform([GPUPointLight; LIGHT_COUNT]);

// Create GPU compatible uniform for lights from ECS data
fn get_lights_uniform(lights: Vec<(GlobalTransform, PointLight)>) -> LightsUniform {
    let mut gpu_lights = [GPUPointLight {
        color: Vec3::ZERO,
        range: 0.0,
        position: Vec3::ZERO,
        intensity: 0.0,
    }; LIGHT_COUNT];

    for (i, (transform, light)) in lights.into_iter().enumerate() {
        if i >= gpu_lights.len() {
            break;
        }
        let color_srgb = light.color.to_srgba();
        gpu_lights[i] = GPUPointLight {
            color: Vec3::new(color_srgb.red, color_srgb.green, color_srgb.blue),
            range: light.range,
            position: transform.translation(),
            intensity: light.intensity,
        };
    }

    LightsUniform(gpu_lights)
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

pub(crate) struct MainRenderPass {
    render_pipeline: RenderPipeline,
    instance_buffer: Buffer,
    indirect_buffer: Buffer,
    mvp_buffer: Buffer,
    uniform_buffer: Buffer,
    lights_uniform_buffer: Buffer,
    vertex_buffer: Buffer,
    bind_group: BindGroup,
    depth_texture_view: TextureView,
}

impl MainRenderPass {
    fn new(
        device: &Device,
        window_size: PhysicalSize<u32>,
        shadow_bind_group_layout: &BindGroupLayout,
    ) -> Self {
        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Depth Texture"),
            size: wgpu::Extent3d {
                width: window_size.width,
                height: window_size.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 4,
            dimension: wgpu::TextureDimension::D2,
            format: TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let mvp_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("MVP Buffer"),
            size: size_of::<Mat4>() as u64, // 2 matrices for model and view projection
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("View Projection Buffer"),
            size: size_of::<Uniforms>() as u64, // 1 matrix for view projection
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let lights_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Lights Uniform Buffer"),
            size: (size_of::<LightsUniform>() * LIGHT_COUNT) as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            render_pipeline: Self::get_pipeline(device, shadow_bind_group_layout),
            bind_group: device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Bind Group"),
                layout: &Self::get_bind_group_layout(device),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: mvp_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: lights_uniform_buffer.as_entire_binding(),
                    },
                ],
            }),
            instance_buffer: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("instance data buffer"),
                size: (size_of::<InstanceData>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            indirect_buffer: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Indirect Draw Buffer"),
                size: (size_of::<wgpu::util::DrawIndirectArgs>() * 6) as u64, // 6 faces per voxel
                usage: wgpu::BufferUsages::INDIRECT | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            mvp_buffer,
            uniform_buffer,
            lights_uniform_buffer,
            depth_texture_view: depth_texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some("Depth Texture View"),
                format: Some(TextureFormat::Depth24Plus),
                dimension: Some(wgpu::TextureViewDimension::D2),
                aspect: wgpu::TextureAspect::All,
                ..Default::default()
            }),

            vertex_buffer: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Vertex Buffer"),
                size: (size_of::<u32>() * 24) as u64, // 6 faces * 4 vertices per face
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
        }
    }

    pub(crate) fn get_bind_group_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
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
        })
    }

    fn get_bind_group(&mut self, device: &Device) -> BindGroup {
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bind Group"),
            layout: &Self::get_bind_group_layout(device),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.mvp_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.lights_uniform_buffer.as_entire_binding(),
                },
            ],
        });

        bind_group
    }

    fn get_pipeline(
        device: &Device,
        shadow_bind_group_layout: &wgpu::BindGroupLayout,
    ) -> RenderPipeline {
        let bind_group_layout = Self::get_bind_group_layout(device);

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_group_layout, shadow_bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Vertex Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/shader.wgsl").into()),
        });

        let swapchain_format = TextureFormat::Rgba16Float;

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
                        array_stride: size_of::<u32>() as u64, // vec3<f32>
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
                cull_mode: Some(Face::Back),
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

    fn prepare_buffers(&mut self, device: &Device, queue: &Queue, voxel_planes: VoxelPlanesData) {
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
                self.indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("Indirect Draw Buffer"),
                    size: indirect_buffer_size,
                    usage: wgpu::BufferUsages::INDIRECT | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
            }
            queue.write_buffer(
                &self.indirect_buffer,
                0,
                bytemuck::cast_slice(&all_indirect_data),
            );
        }

        // Write all vertex data to the GPU buffer
        {
            // Vertex buffer used to store model indices
            self.vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Vertex Buffer"),
                size: (size_of::<u32>() * 24 * voxel_object_count).max(size_of::<u32>() * 24)
                    as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            queue.write_buffer(
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
                self.mvp_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("MVP Buffer"),
                    size: new_buffer_size,
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
            }
            queue.write_buffer(&self.mvp_buffer, 0, bytemuck::cast_slice(&all_mvp_data));
            self.bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Bind Group"),
                layout: &device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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
                            visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Buffer {
                                ty: wgpu::BufferBindingType::Uniform,
                                has_dynamic_offset: false,
                                min_binding_size: None,
                            },
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
                }),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.mvp_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: self.lights_uniform_buffer.as_entire_binding(),
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
                self.instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("instance data buffer"),
                    size: total_instance_buffer_size.max(size_of::<InstanceData>() as u64),
                    usage: wgpu::BufferUsages::VERTEX
                        | wgpu::BufferUsages::COPY_DST
                        | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                });

                // Write all instance data to the GPU buffer
                queue.write_buffer(
                    &self.instance_buffer,
                    0,
                    bytemuck::cast_slice(&all_instance_data),
                );
            }
        }

        gpu_upload_span.exit();
    }

    fn enqueue(
        &mut self,
        device: &Device,
        queue: &Queue,
        texture_view: &TextureView,
        msaa_resolve_texture_view: &TextureView,
        shadow_bind_group: &BindGroup,
        draw_count: u32,
        camera_position: Vec3,
        lights_data: LightsData,
        view_proj: Mat4,
    ) -> () {
        let uniforms = Uniforms {
            view_proj,
            camera_position: Vec4::new(
                camera_position.x,
                camera_position.y,
                camera_position.z,
                1.0,
            ),
        };
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));
        queue.write_buffer(
            &self.lights_uniform_buffer,
            0,
            bytemuck::cast_slice(&get_lights_uniform(lights_data).0),
        );

        let mut encoder = device.create_command_encoder(&Default::default());
        let mut renderpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: msaa_resolve_texture_view,
                resolve_target: Some(texture_view),
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.56,
                        g: 0.8,
                        b: 1.0,
                        a: 1.0,
                    }),
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
        renderpass.set_bind_group(1, shadow_bind_group, &[]);

        // Single multi_draw_indirect call for all entities
        renderpass.multi_draw_indirect(
            &self.indirect_buffer,
            0, // Start at beginning of buffer
            draw_count,
        );
        drop(renderpass);

        queue.submit([encoder.finish()]);
    }
}

impl RenderState {
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

        let swapchain_format = TextureFormat::Rgba16Float;

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

        let swapchain_format = TextureFormat::Rgba16Float;

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
                targets: &[Some(swapchain_format.into())],
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
        let surface_format = TextureFormat::Rgba16Float;

        let shadow_pass = ShadowRenderPass::new(&device);

        let shadow_bind_group_layout =
            device.create_bind_group_layout(SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR);

        let main_pass = MainRenderPass::new(&device, size, &shadow_bind_group_layout);
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
                width: size.width,
                height: size.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 4,
            dimension: wgpu::TextureDimension::D2,
            format: surface_format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[surface_format],
        });

        let main_pass_texture_view = main_pass_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Main Pass Texture View"),
            format: Some(surface_format),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
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
            main_pass_texture_view,
            wireframe_pipeline,
            main_pass,
            shadow_pass,
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
            view_formats: vec![self.surface_format],
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            width: self.size.width,
            height: self.size.height,
            desired_maximum_frame_latency: 2,
            present_mode: wgpu::PresentMode::Immediate,
        };
        self.surface.configure(&self.device, &surface_config);
    }

    fn resize(&mut self, new_size: PhysicalSize<u32>) {
        self.size = new_size;
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
                format: Some(self.surface_format),
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
    ) {
        let render_span = info_span!("Voxel render").entered();
        let surface_texture = self.get_surface_texture();
        let texture_view = self.get_texture_view(&surface_texture);
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
            &texture_view,
            &self.main_pass_texture_view,
            &self.shadow_pass.shadow_bind_group,
            draw_count,
            camera_position,
            lights_data,
            view_proj,
        );

        // Debug debug
        {
            let texture_view = self.get_texture_view(&surface_texture);
            let depth_debug_command_buffer = self.enqueue_depth_debug_pass(texture_view);
            self.queue.submit([depth_debug_command_buffer]);
        }

        self.window.pre_present_notify();
        surface_texture.present();
        render_span.exit();
    }
}

struct VoxelExtractApp {
    world_message_sender: Sender<WorldMessage>,
    app: App,
    window: Arc<Window>,
    render_finished_receiver: Receiver<()>,
    // keyboard_event_writer: EventWriter<KeyboardEvent>,
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
                match event.logical_key {
                    Key::Named(winit::keyboard::NamedKey::Escape) => {
                        if event.state.is_pressed() {
                            event_loop.exit();
                        }
                    }
                    _ => {
                        match event.state {
                            ElementState::Pressed => {
                                self.app.world_mut().send_event(KeyPressedEvent(event.logical_key));
                            }
                            ElementState::Released => {
                                self.app.world_mut().send_event(KeyReleasedEvent(event.logical_key));
                            }
                        }
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

pub type LightsData = Vec<(GlobalTransform, PointLight)>;

pub type WorldMessage = (Mat4, VoxelPlanesData, SunData, Vec3, LightsData);

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
                        .with_inner_size(winit::dpi::LogicalSize::new(1920, 1080))
                        .with_title("Soulflame"),
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
                if let Ok((view_proj, voxel_planes, sun_data, camera_position, lights)) =
                    world_message_receiver.recv()
                {
                    if voxel_planes.is_empty() {
                        render_finished_sender
                            .send(())
                            .expect("Failed to send render finished signal");
                        continue; // Skip rendering if no voxel planes are available
                    }
                    let (shadow_transform, _) = sun_data;
                    let shadow_view = shadow_transform.compute_matrix().inverse();

                    // Send a signal that the next update can begin
                    render_finished_sender
                        .send(())
                        .expect("Failed to send render finished signal");
                    render_state.render(
                        view_proj,
                        shadow_view,
                        voxel_planes,
                        camera_position,
                        lights,
                    );
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
