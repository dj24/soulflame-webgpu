use crate::render::main::InstanceData;
use crate::render::util::get_view_projection_matrix;
use bevy::math::{Mat4, Rect, Vec2, Vec3, Vec4};
use bevy::prelude::{default, OrthographicProjection, Projection};
use wgpu::{
    BindGroup, Buffer, Device, Queue, RenderPipeline, TexelCopyTextureInfo, TextureFormat,
    TextureView, VertexAttribute, VertexStepMode,
};

type Cascade = (Projection, Mat4);

pub const SHADOW_MAP_SIZE: u32 = 4096;

const CASCADE_DISTANCES: [f32; 4] = [125.0, 250.0, 500.0, 1000.0];

// Shadow map view, sampler, and light view projection matrix
pub const SHADOW_BIND_GROUP_LAYOUT_DESCRIPTOR: &wgpu::BindGroupLayoutDescriptor =
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

pub struct ShadowRenderPass {
    pub(crate) shadow_map_texture_view: TextureView,
    shadow_pass_target_view: TextureView,
    shadow_map_texture: wgpu::Texture,
    shadow_pass_target_texture: wgpu::Texture,
    shadow_projection_buffer: Buffer,
    shadow_render_pipeline: RenderPipeline,
    pub(crate) shadow_bind_group: BindGroup,
}

impl ShadowRenderPass {
    pub(crate) fn new(device: &Device) -> Self {
        let shadow_projection_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Shadow Projection Buffer"),
            size: (size_of::<Mat4>() * 4) as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let shadow_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shadow Map Texture"),
            size: wgpu::Extent3d {
                width: SHADOW_MAP_SIZE,
                height: SHADOW_MAP_SIZE,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let shadow_pass_target_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shadow Map Texture"),
            size: wgpu::Extent3d {
                width: SHADOW_MAP_SIZE / 2,
                height: SHADOW_MAP_SIZE / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        let shadow_map_texture_view = shadow_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Shadow Map Texture View"),
            format: Some(wgpu::TextureFormat::Depth24Plus),
            dimension: Some(wgpu::TextureViewDimension::D2),
            aspect: wgpu::TextureAspect::All,
            ..Default::default()
        });

        let shadow_pass_target_view =
            shadow_pass_target_texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some("Shadow Pass Target View"),
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

        let bind_group_layout = crate::render::main::MainRenderPass::get_bind_group_layout(&device);

        let shadow_render_pipeline = Self::get_shadow_render_pipeline(&device, &bind_group_layout);

        Self {
            shadow_map_texture_view,
            shadow_pass_target_view,
            shadow_map_texture: shadow_texture,
            shadow_pass_target_texture,
            shadow_projection_buffer,
            shadow_render_pipeline,
            shadow_bind_group,
        }
    }

    pub(crate) fn enqueue(
        &self,
        device: &Device,
        queue: &Queue,
        shadow_view: Mat4,
        camera_position: Vec3,
        draw_count: u32,
        draw_buffers: &crate::render::main::DrawBuffers,
        bind_group: &BindGroup,
    ) -> () {
        // Shadow
        {
            let cascades: Vec<Cascade> = (0..4)
                .map(|i| {
                    let size = CASCADE_DISTANCES[i];
                    let projection = Projection::Orthographic(OrthographicProjection {
                        near: -1000.0,
                        far: 1000.0,
                        viewport_origin: Default::default(),
                        scaling_mode: Default::default(),
                        scale: 1.0,
                        area: Rect {
                            min: Vec2::new(-size, -size),
                            max: Vec2::new(size, size),
                        },
                    });

                    // Use the original light transform for all cascades
                    (projection, shadow_view)
                })
                .collect();

            let cascade_view_projections = &cascades
                .iter()
                .map(|(p, _)| get_view_projection_matrix(p, &shadow_view.inverse()))
                .collect::<Vec<_>>();

            for i in 0..4 {
                let uniforms = crate::render::main::Uniforms {
                    view_proj: cascade_view_projections[i],
                    camera_position: Vec4::new(
                        camera_position.x,
                        camera_position.y,
                        camera_position.z,
                        1.0,
                    ),
                };
                queue.write_buffer(
                    &draw_buffers.uniform_buffer,
                    0,
                    bytemuck::cast_slice(&[uniforms]),
                );
                let mut encoder = device.create_command_encoder(&Default::default());

                // Render pass
                {
                    let mut renderpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: None,
                        color_attachments: &[],
                        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                            view: &self.shadow_pass_target_view,
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
                    renderpass.set_vertex_buffer(1, draw_buffers.vertex_buffer.slice(..));
                    renderpass.set_vertex_buffer(0, draw_buffers.instance_buffer.slice(..));
                    renderpass.set_bind_group(0, bind_group, &[]);

                    // Single multi_draw_indirect call for all entities
                    renderpass.multi_draw_indirect(
                        &draw_buffers.indirect_buffer,
                        0, // Start at the beginning of buffer
                        draw_count as u32,
                    );
                }

                let shadow_pass_command_buffer = encoder.finish();
                let mut copy_encoder = device.create_command_encoder(&Default::default());

                let origin = match i {
                    0 => wgpu::Origin3d::ZERO,
                    1 => wgpu::Origin3d {
                        x: SHADOW_MAP_SIZE / 2,
                        y: 0,
                        z: 0,
                    },
                    2 => wgpu::Origin3d {
                        x: 0,
                        y: SHADOW_MAP_SIZE / 2,
                        z: 0,
                    },
                    3 => wgpu::Origin3d {
                        x: SHADOW_MAP_SIZE / 2,
                        y: SHADOW_MAP_SIZE / 2,
                        z: 0,
                    },
                    _ => unreachable!(),
                };

                let copy_source = TexelCopyTextureInfo {
                    texture: &self.shadow_pass_target_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                };
                let copy_destination = TexelCopyTextureInfo {
                    texture: &self.shadow_map_texture,
                    mip_level: 0,
                    origin,
                    aspect: wgpu::TextureAspect::All,
                };
                let copy_size = wgpu::Extent3d {
                    width: SHADOW_MAP_SIZE / 2,
                    height: SHADOW_MAP_SIZE / 2,
                    depth_or_array_layers: 1,
                };
                copy_encoder.copy_texture_to_texture(copy_source, copy_destination, copy_size);
                let copy_shadow_command_buffer = copy_encoder.finish();

                queue.submit([shadow_pass_command_buffer, copy_shadow_command_buffer]);
            }

            queue.write_buffer(
                &self.shadow_projection_buffer,
                0,
                bytemuck::cast_slice(&cascade_view_projections),
            );
        }
    }

    fn get_shadow_render_pipeline(
        device: &Device,
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
                        attributes: &[VertexAttribute {
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
}
