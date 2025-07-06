use bevy::math::Vec3;
use bevy::pbr::PointLight;
use bevy::prelude::*;
use bytemuck::{Pod, Zeroable};
use wgpu::{BindGroup, BindGroupLayout, Device, Face, Queue, RenderPipeline, TextureFormat, TextureView, VertexAttribute, VertexStepMode};
use crate::render::main::{InstanceData, LightsData, Uniforms, VoxelPlanesData};

#[derive(Pod, Zeroable, Clone, Copy)]
#[repr(C)]
struct GPUPointLight {
    color: Vec3,
    range: f32,
    position: Vec3,
    intensity: f32,
}

const LIGHT_COUNT: usize = 32;

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

pub(crate) struct MainRenderPass {
    pub(crate) render_pipeline: wgpu::RenderPipeline,
    pub(crate) instance_buffer: wgpu::Buffer,
    pub(crate) indirect_buffer: wgpu::Buffer,
    pub(crate) mvp_buffer: wgpu::Buffer,
    pub(crate) uniform_buffer: wgpu::Buffer,
    pub(crate) lights_uniform_buffer: wgpu::Buffer,
    pub(crate) vertex_buffer: wgpu::Buffer,
    pub(crate) bind_group: wgpu::BindGroup,
    pub(crate) depth_texture_view: wgpu::TextureView,
}

impl MainRenderPass {
    pub(crate) fn new(
        device: &Device,
        shadow_bind_group_layout: &BindGroupLayout,
        initial_size: (u32, u32),
    ) -> Self {
        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Depth Texture"),
            size: wgpu::Extent3d {
                width: initial_size.0,
                height: initial_size.1,
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

    pub(crate) fn get_bind_group(&mut self, device: &Device) -> BindGroup {
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

    pub(crate) fn get_pipeline(
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
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/shader.wgsl").into()),
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

    pub(crate) fn prepare_buffers(&mut self, device: &Device, queue: &Queue, voxel_planes: VoxelPlanesData) {
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

    pub(crate) fn enqueue(
        &mut self,
        device: &Device,
        queue: &Queue,
        msaa_texture_view: &TextureView,
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
                view: msaa_texture_view,
                resolve_target: None,
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
