use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
};

fn main() {
    env_logger::init(); // Necessary for logging within WGPU
    let event_loop = EventLoop::new().unwrap();// Loop provided by winit for handling window events
    let window = Some(event_loop.create_window(window_attributes).unwrap());
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::PRIMARY,
        ..Default::default()
    });
    let surface = unsafe { instance.create_surface(&window) };
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface),
        force_fallback_adapter: false,
    })).unwrap();

    let (device, queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            memory_hints: wgpu::MemoryHints::Performance,
            label: None,
            required_features: wgpu::Features::TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES,
            required_limits: wgpu::Limits::default(),
        },
        None, // Trace path
    ))
        .unwrap();

    let size = window.inner_size();


    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("Bind Group Layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::StorageTexture {
                    access: wgpu::StorageTextureAccess::ReadWrite,
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    view_dimension: wgpu::TextureViewDimension::D2,
                },
                count: None,
            },
        ],
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("Pipeline Layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("Compute Pipeline"),
        layout: Some(&pipeline_layout),
        module: &device.create_shader_module(&wgpu::ShaderModuleDescriptor {
            label: Some("Compute Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("compute.wgsl").into()),
        }),
        entry_point: "main",
    });


    // Opens the window and starts processing events (although no events are handled yet)
    // event_loop.run(move |event, _, control_flow| {
    //     match event {
    //         Event::WindowEvent {
    //             event: WindowEvent::CloseRequested,
    //             window_id,
    //         } if window_id == window.id() => *control_flow = ControlFlow::Exit,
    //         Event::WindowEvent {
    //             event: WindowEvent::KeyboardInput { input, .. },
    //             window_id,
    //         } if window_id == window.id() => {
    //             if input.virtual_keycode == Some(VirtualKeyCode::Escape) {
    //                 *control_flow = ControlFlow::Exit
    //             }
    //         },
    //         Event::RedrawRequested(_) => {
    //             let output = surface.get_current_texture().unwrap();
    //             let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
    //
    //             let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
    //                 label: Some("Bind Group"),
    //                 layout: &bind_group_layout,
    //                 entries: &[
    //                     wgpu::BindGroupEntry {
    //                         binding: 0,
    //                         resource: wgpu::BindingResource::TextureView(&view),
    //                     },
    //                 ],
    //             });
    //             let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    //                 label: Some("Compute Encoder"),
    //             });
    //             let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
    //                 label: Some("Compute Pass"),
    //             });
    //
    //             compute_pass.set_pipeline(&compute_pipeline);
    //             compute_pass.set_bind_group(0, &bind_group, &[]);
    //             compute_pass.dispatch(size.width / 8, size.height / 8, 1);
    //             drop(compute_pass);
    //
    //             // submit will accept anything that implements IntoIter
    //             queue.submit(std::iter::once(encoder.finish()));
    //             output.present();
    //         },
    //         _ => {}
    //     }
    // });
}