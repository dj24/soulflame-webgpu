use bevy::app::{AppLabel, PluginsState};
use bevy::prelude::{error, App, AppExit, Camera, Camera3d, Commands, Event, GlobalTransform, Mut, Plugin, PostUpdate, PreStartup, ResMut, Resource, Startup, SubApp, Update, World};
use std::sync::Arc;
use async_channel::{Receiver, Sender};
use bevy::ecs::schedule::MainThreadExecutor;
use bevy::log::info;
use bevy::tasks::ComputeTaskPool;
use winit::{
    application::ApplicationHandler,
    event::WindowEvent,
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    window::{Window, WindowId},
};
use winit::error::EventLoopError;

struct RenderState {
    window: Arc<Window>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    size: winit::dpi::PhysicalSize<u32>,
    surface: wgpu::Surface<'static>,
    surface_format: wgpu::TextureFormat,
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

        let state = RenderState {
            window,
            device,
            queue,
            size,
            surface,
            surface_format,
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

    fn render(&mut self) {
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

        // Renders a GREEN screen
        let mut encoder = self.device.create_command_encoder(&Default::default());
        // Create the renderpass which will clear the screen.
        let renderpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &texture_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::GREEN),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        // If you wanted to call any drawing commands, they would go here.

        // End the renderpass.
        drop(renderpass);

        // Submit the command in the queue to execute
        self.queue.submit([encoder.finish()]);
        self.window.pre_present_notify();
        surface_texture.present();
    }
}

#[derive(Default, Resource)]
struct VoxelRenderApp {
    state: Option<RenderState>,
}

impl ApplicationHandler for VoxelRenderApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        // Create window object
        let window = Arc::new(
            event_loop
                .create_window(Window::default_attributes())
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
                state.render();
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

fn init_event_loop() -> Result<(), EventLoopError> {
    match EventLoop::new() {
        Ok(event_loop) => {
            event_loop.set_control_flow(ControlFlow::Poll);
            println!("Event loop created successfully");
            let mut app = VoxelRenderApp::default();
            event_loop.run_app(&mut app)?;
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to create event loop: {}", e);
            Err(e)
        }
    }
}


/// Channels used by the main app to send and receive the render app.
#[derive(Resource)]
pub struct RenderAppChannels {
    app_to_render_sender: Sender<SubApp>,
    render_to_app_receiver: Receiver<SubApp>,
    render_app_in_render_thread: bool,
}

impl RenderAppChannels {
    /// Create a `RenderAppChannels` from a [`async_channel::Receiver`] and [`async_channel::Sender`]
    pub fn new(
        app_to_render_sender: Sender<SubApp>,
        render_to_app_receiver: Receiver<SubApp>,
    ) -> Self {
        Self {
            app_to_render_sender,
            render_to_app_receiver,
            render_app_in_render_thread: false,
        }
    }

    /// Send the `render_app` to the rendering thread.
    pub fn send_blocking(&mut self, render_app: SubApp) {
        self.app_to_render_sender.send_blocking(render_app).unwrap();
        self.render_app_in_render_thread = true;
    }

    /// Receive the `render_app` from the rendering thread.
    /// Return `None` if the render thread has panicked.
    pub async fn recv(&mut self) -> Option<SubApp> {
        let render_app = self.render_to_app_receiver.recv().await.ok()?;
        self.render_app_in_render_thread = false;
        Some(render_app)
    }
}

impl Drop for RenderAppChannels {
    fn drop(&mut self) {
        if self.render_app_in_render_thread {
            // Any non-send data in the render world was initialized on the main thread.
            // So on dropping the main world and ending the app, we block and wait for
            // the render world to return to drop it. Which allows the non-send data
            // drop methods to run on the correct thread.
            self.render_to_app_receiver.recv_blocking().ok();
        }
    }
}


// This function waits for the rendering world to be received,
// runs extract, and then sends the rendering world back to the render thread.
fn renderer_extract(app_world: &mut World, _world: &mut World) {
    app_world.resource_scope(|world, main_thread_executor: Mut<MainThreadExecutor>| {
        world.resource_scope(|world, mut render_channels: Mut<RenderAppChannels>| {
            // we use a scope here to run any main thread tasks that the render world still needs to run
            // while we wait for the render world to be received.
            if let Some(mut render_app) = ComputeTaskPool::get()
                .scope_with_executor(true, Some(&*main_thread_executor.0), |s| {
                    s.spawn(async { render_channels.recv().await });
                })
                .pop()
                .unwrap()
            {
                render_app.extract(world);

                render_channels.send_blocking(render_app);
            } else {
                // Renderer thread panicked
                world.send_event(AppExit::error());
            }
        });
    });
}

fn hello_world() {
    info!("Hello world!");
}

pub fn winit_runner(mut app: App) -> AppExit {
    let event_loop  = EventLoop::new().unwrap();

    if app.plugins_state() == PluginsState::Ready {
        app.finish();
        app.cleanup();
    }
    //
    // app.world_mut()
    //     .insert_resource(EventLoopProxyWrapper(event_loop.create_proxy()));

    let mut app = VoxelRenderApp::default();
    event_loop.run_app(&mut app);

    AppExit::Success
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, AppLabel)]
struct VoxelRenderAppLabel;

pub struct VoxelRenderPlugin;

impl Plugin for VoxelRenderPlugin {
    fn build(&self, app: &mut App) {
        app.set_runner(|app| winit_runner(app));
        app.add_systems(Update, hello_world);
        app.insert_resource(MainThreadExecutor::new());
        let mut sub_app = SubApp::new();
        sub_app.set_extract(renderer_extract);
        app.insert_sub_app(VoxelRenderAppLabel, sub_app);
    }

    // Sets up the render thread and inserts resources into the main app used for controlling the render thread.
    fn cleanup(&self, app: &mut App) {
        match app.get_sub_app_mut(VoxelRenderAppLabel) {
            Some(sub_app) => {
                let (app_to_render_sender, app_to_render_receiver) = async_channel::bounded::<SubApp>(1);
                let (render_to_app_sender, render_to_app_receiver) = async_channel::bounded::<SubApp>(1);

                app.insert_resource(RenderAppChannels::new(
                    app_to_render_sender,
                    render_to_app_receiver,
                ));

                // init_event_loop();
            }
            None => return,
        }


    }
}
