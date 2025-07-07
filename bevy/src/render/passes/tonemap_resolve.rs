use crate::render::main::SURFACE_FORMAT;
use wgpu::{ComputePipeline, Device, RenderPipeline, Texture, TextureFormat, TextureView};
use std::fs;

pub struct TonemapResolvePass {
    render_pipeline: RenderPipeline,
    output_texture: Texture,
    lut_texture: Texture,
    lut_texture_view: TextureView,
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
                // LUT 3D texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D3,
                        multisampled: false,
                    },
                    count: None,
                },
                // LUT sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        })
    }

    fn load_lut_data() -> Result<(Vec<f32>, u32), Box<dyn std::error::Error>> {
        let lut_path = "src/render/luts/Korben 214.CUBE";
        let content = fs::read_to_string(lut_path)?;

        let mut lut_size = 0u32;
        let mut lut_data = Vec::new();

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("LUT_3D_SIZE") {
                lut_size = line.split_whitespace().nth(1).unwrap().parse()?;
            } else if !line.starts_with('#') && !line.starts_with("TITLE") && !line.starts_with("DOMAIN_") && !line.is_empty() {
                // Parse RGB values
                let values: Vec<f32> = line.split_whitespace()
                    .take(3)
                    .map(|s| s.parse().unwrap_or(0.0))
                    .collect();
                if values.len() == 3 {
                    lut_data.extend(values);
                }
            }
        }

        Ok((lut_data, lut_size))
    }

    fn create_lut_texture(device: &Device, queue: &wgpu::Queue) -> (Texture, TextureView) {
        let (lut_data, lut_size) = Self::load_lut_data().expect("Failed to load LUT data");

        let lut_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("LUT 3D Texture"),
            size: wgpu::Extent3d {
                width: lut_size,
                height: lut_size,
                depth_or_array_layers: lut_size,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D3,
            format: TextureFormat::Rgba8Unorm, // Changed from Rgba32Float to support filtering
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // Convert RGB data to RGBA8 format
        let mut rgba_data = Vec::with_capacity(lut_data.len() / 3 * 4); // 4 components, 1 byte each
        for chunk in lut_data.chunks(3) {
            // Convert float [0,1] to u8 [0,255]
            rgba_data.push((chunk[0] * 255.0) as u8); // R
            rgba_data.push((chunk[1] * 255.0) as u8); // G
            rgba_data.push((chunk[2] * 255.0) as u8); // B
            rgba_data.push(255u8); // Alpha = 255
        }

        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &lut_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &rgba_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(lut_size * 4), // 4 components * 1 byte each
                rows_per_image: Some(lut_size),
            },
            wgpu::Extent3d {
                width: lut_size,
                height: lut_size,
                depth_or_array_layers: lut_size,
            },
        );

        let lut_texture_view = lut_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("LUT 3D Texture View"),
            format: Some(TextureFormat::Rgba8Unorm), // Updated format
            dimension: Some(wgpu::TextureViewDimension::D3),
            aspect: wgpu::TextureAspect::All,
            base_mip_level: 0,
            mip_level_count: Some(1),
            base_array_layer: 0,
            array_layer_count: None,
            usage: Some(wgpu::TextureUsages::TEXTURE_BINDING),
        });

        (lut_texture, lut_texture_view)
    }

    pub fn new(device: &Device, queue: &wgpu::Queue, initial_size: (u32, u32)) -> Self {

        let fullscreen_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Tonemap Resolve Fullscreen Shader"),
            source: wgpu::ShaderSource::Wgsl(
                include_str!("../shaders/tonemap-resolve-fullscreen-quad.wgsl").into(),
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

        let (lut_texture, lut_texture_view) = Self::create_lut_texture(device, queue);

        Self {
            output_texture,
            render_pipeline,
            lut_texture,
            lut_texture_view,
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

        let lut_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("LUT Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            compare: None,
            lod_min_clamp: 0.0,
            lod_max_clamp: 32.0,
            border_color: None,
            anisotropy_clamp: 1,
        });

        let render_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Tonemap Resolve Render Bind Group"),
            layout: &TonemapResolvePass::get_render_bind_group_layout(&device),
            entries: &[
                // Input texture binding
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input_texture_view),
                },
                // LUT texture binding
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&self.lut_texture_view),
                },
                // LUT sampler binding
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&lut_sampler),
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
