use wgpu::{ComputePipeline, Device, Texture, TextureView};
use crate::render::main::SURFACE_FORMAT;

pub struct TonemapResolvePass {
    compute_pipeline: ComputePipeline,
}

type TextureWithView<'a> = (&'a Texture, &'a TextureView);

const THREAD_GROUP_SIZE_X: u32 = 8; // Adjust based on your shader's requirements
const THREAD_GROUP_SIZE_Y: u32 = 8; // Adjust based on your shader's requirements

impl TonemapResolvePass {
    fn get_bind_group_layout(device: &Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Tonemap Resolve Bind Group Layout"),
            entries: &[
                // Input texture
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: true,
                    },
                    count: None,
                },
                // Output texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        format: SURFACE_FORMAT,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        access: wgpu::StorageTextureAccess::WriteOnly,
                    },
                    count: None,
                },
            ],
        })
    }

    pub fn new(device: &Device) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Tonemap Resolve Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/tonemap_resolve.compute.wgsl").into()),
        });

        let bind_group_layout = TonemapResolvePass::get_bind_group_layout(device);

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Tonemap Resolve Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Tonemap Resolve Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });

        Self { compute_pipeline }
    }

    pub fn enqueue(
        &self,
        device: &Device,
        queue: &wgpu::Queue,
        input_texture_and_view: TextureWithView,
        output_texture_and_view: TextureWithView,
    ) {
        let (input_texture, input_texture_view) = input_texture_and_view;
        let (_, output_texture_view) = output_texture_and_view;

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Tonemap Resolve Bind Group"),
            layout: &TonemapResolvePass::get_bind_group_layout(&device),
            entries: &[
                // Input texture binding
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input_texture_view),
                },
                // Output texture binding
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&output_texture_view),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Tonemap Resolve Command Encoder"),
        });

        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Tonemap Resolve Compute Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&self.compute_pipeline);
            compute_pass.set_bind_group(0, &bind_group, &[]);
            let workgroup_size_x = (input_texture.size().width / THREAD_GROUP_SIZE_X).min(THREAD_GROUP_SIZE_X);
            let workgroup_size_y = (input_texture.size().height / THREAD_GROUP_SIZE_Y).min(THREAD_GROUP_SIZE_Y);
            compute_pass.dispatch_workgroups(workgroup_size_x, workgroup_size_y, 1); // Adjust as necessary for your texture size
        }

        queue.submit(Some(encoder.finish()));
    }
}