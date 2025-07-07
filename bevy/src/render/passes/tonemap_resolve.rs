use crate::render::main::SURFACE_FORMAT;
use wgpu::{ComputePipeline, Device, RenderPipeline, Texture, TextureFormat, TextureView};

pub struct TonemapResolvePass {
    render_pipeline: RenderPipeline,
    output_texture: Texture,
}

type TextureWithView<'a> = (&'a Texture, &'a TextureView);

// Tonemaps and manually resolves the multisampled texture to a resolved texture, then renders it to the surface.
impl TonemapResolvePass {

    fn get_render_bind_group_layout(device: &Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Tonemap Resolve Render Bind Group Layout"),
            entries: &[
                // Multisampled texture
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: true,
                    },
                    count: None,
                },
            ],
        })
    }

    pub fn new(device: &Device, initial_size: (u32, u32)) -> Self {

        let fullscreen_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Tonemap Resolve Fullscreen Shader"),
            source: wgpu::ShaderSource::Wgsl(
                include_str!("../shaders/fullscreen-quad.wgsl").into(),
            ),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Tonemap Resolve Pipeline Layout"),
            bind_group_layouts: &[
                &TonemapResolvePass::get_render_bind_group_layout(device),
            ],
            push_constant_ranges: &[],
        });


        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Tonemap Resolve Output Texture"),
            size: wgpu::Extent3d {
                width: initial_size.0,
                height: initial_size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Tonemap Resolve Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &fullscreen_shader,
                entry_point: Some("vertex"), // Adjust based on your shader
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &fullscreen_shader,
                entry_point: Some("fragment"), // Adjust based on your shader
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: SURFACE_FORMAT,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None, // Adjust if you need depth testing
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
            cache: None,
        });

        Self {
            output_texture,
            render_pipeline,
        }
    }

    pub fn enqueue(
        &self,
        device: &Device,
        queue: &wgpu::Queue,
        input_texture_and_view: TextureWithView,
        surface_texture_and_view: TextureWithView,
    ) {
        let (_, input_texture_view) = input_texture_and_view;
        let (_, surface_texture_view) = surface_texture_and_view;

        let render_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Tonemap Resolve Render Bind Group"),
            layout: &TonemapResolvePass::get_render_bind_group_layout(&device),
            entries: &[
                // Output texture binding
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input_texture_view),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Tonemap Resolve Command Encoder"),
        });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Tonemap Resolve Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &surface_texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &render_bind_group, &[]);
            render_pass.draw(0..4, 0..1);
        }

        queue.submit(Some(encoder.finish()));
    }
}
