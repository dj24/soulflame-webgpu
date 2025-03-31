//! A shader that renders a mesh multiple times in one draw call.
//!
//! Bevy will automatically batch and instance your meshes assuming you use the same
//! `Handle<Material>` and `Handle<Mesh>` for all of your instances.
//!
//! This example is intended for advanced users and shows how to make a custom instancing
//! implementation using bevy's low level rendering api.
//! It's generally recommended to try the built-in instancing before going with this approach.

use bevy::reflect::Array;
use bevy::render::render_resource::binding_types::uniform_buffer;
use bevy::render::renderer::RenderQueue;
use bevy::{
    core_pipeline::core_3d::Transparent3d,
    ecs::{
        query::QueryItem,
        system::{lifetimeless::*, SystemParamItem},
    },
    pbr::{
        MeshPipeline, MeshPipelineKey, RenderMeshInstances, SetMeshBindGroup, SetMeshViewBindGroup,
    },
    prelude::*,
    render::{
        extract_component::{ExtractComponent, ExtractComponentPlugin},
        mesh::{
            allocator::MeshAllocator, MeshVertexBufferLayoutRef, RenderMesh, RenderMeshBufferInfo,
        },
        render_asset::RenderAssets,
        render_phase::{
            AddRenderCommand, DrawFunctions, PhaseItem, PhaseItemExtraIndex, RenderCommand,
            RenderCommandResult, SetItemPipeline, TrackedRenderPass, ViewSortedRenderPhases,
        },
        render_resource::*,
        renderer::RenderDevice,
        sync_world::MainEntity,
        view::ExtractedView,
        Render, RenderApp, RenderSet,
    },
};
use bytemuck::{Pod, Zeroable};

/// This example uses a shader source file from the assets subdirectory
const SHADER_ASSET_PATH: &str = "shaders/instancing.wgsl";

#[derive(Component, Deref)]
pub struct InstanceMaterialData(pub Vec<InstanceData>);

#[derive(Component, Deref)]
pub struct TransformUniform(pub Mat4);

impl ExtractComponent for InstanceMaterialData {
    type QueryData = (&'static Self, &'static GlobalTransform);
    type QueryFilter = ();
    type Out = (Self, TransformUniform);

    fn extract_component(item: QueryItem<'_, Self::QueryData>) -> Option<Self::Out> {
        let (instance_data, global_transform) = item;
        let foo = instance_data.0.clone();
        Some((
            InstanceMaterialData(foo),
            TransformUniform(global_transform.compute_matrix()),
        ))
    }
}

pub struct InstancedMaterialPlugin;

impl Plugin for InstancedMaterialPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(ExtractComponentPlugin::<InstanceMaterialData>::default());
        app.sub_app_mut(RenderApp)
            .add_render_command::<Transparent3d, DrawCustom>()
            .init_resource::<SpecializedMeshPipelines<CustomPipeline>>()
            .add_systems(
                Render,
                (
                    queue_custom.in_set(RenderSet::QueueMeshes),
                    prepare_instance_buffers.in_set(RenderSet::PrepareResources),
                ),
            );
    }

    fn finish(&self, app: &mut App) {
        app.sub_app_mut(RenderApp).init_resource::<CustomPipeline>();
    }
}

#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct InstanceData {
    pub(crate) position: [u8; 3],
    pub(crate) x_extent: u8,
    pub(crate) color: [u8; 3],
    pub(crate) y_extent: u8,
}

#[allow(clippy::too_many_arguments)]
fn queue_custom(
    transparent_3d_draw_functions: Res<DrawFunctions<Transparent3d>>,
    custom_pipeline: Res<CustomPipeline>,
    mut pipelines: ResMut<SpecializedMeshPipelines<CustomPipeline>>,
    pipeline_cache: Res<PipelineCache>,
    meshes: Res<RenderAssets<RenderMesh>>,
    render_mesh_instances: Res<RenderMeshInstances>,
    material_meshes: Query<(Entity, &MainEntity), With<InstanceMaterialData>>,
    mut transparent_render_phases: ResMut<ViewSortedRenderPhases<Transparent3d>>,
    views: Query<(Entity, &ExtractedView, &Msaa)>,
) {
    let draw_custom = transparent_3d_draw_functions.read().id::<DrawCustom>();

    for (view_entity, view, msaa) in &views {
        let Some(transparent_phase) = transparent_render_phases.get_mut(&view_entity) else {
            continue;
        };

        let msaa_key = MeshPipelineKey::from_msaa_samples(msaa.samples());

        let view_key = msaa_key | MeshPipelineKey::from_hdr(view.hdr);
        let rangefinder = view.rangefinder3d();
        for (entity, main_entity) in &material_meshes {
            let Some(mesh_instance) = render_mesh_instances.render_mesh_queue_data(*main_entity)
            else {
                continue;
            };
            let Some(mesh) = meshes.get(mesh_instance.mesh_asset_id) else {
                continue;
            };
            let key =
                view_key | MeshPipelineKey::from_primitive_topology(mesh.primitive_topology());
            let pipeline = pipelines
                .specialize(&pipeline_cache, &custom_pipeline, key, &mesh.layout)
                .unwrap();
            transparent_phase.add(Transparent3d {
                entity: (entity, *main_entity),
                pipeline,
                draw_function: draw_custom,
                distance: rangefinder.distance_translation(&mesh_instance.translation),
                batch_range: 0..1,
                extra_index: PhaseItemExtraIndex::NONE,
            });
        }
    }
}

#[derive(Component)]
struct InstanceBuffer {
    buffer: Buffer,
    length: usize,
}

#[derive(Component)]
struct TransformBindGroup(BindGroup);

fn prepare_instance_buffers(
    mut commands: Commands,
    query: Query<(Entity, &InstanceMaterialData, &TransformUniform)>,
    render_device: Res<RenderDevice>,
    render_queue: Res<RenderQueue>,
) {
    let start = std::time::Instant::now();
    let layout = render_device.create_bind_group_layout(
        "transforms",
        &BindGroupLayoutEntries::with_indices(
            ShaderStages::VERTEX,
            (
                (0, uniform_buffer::<Vec4>(false)),
                (1, uniform_buffer::<Vec4>(false)),
                (2, uniform_buffer::<Vec4>(false)),
                (3, uniform_buffer::<Vec4>(false)),
            ),
        ),
    );


    //TODO: optimise this
    for (entity, instance_data, global_transform) in &query {
        let buffer = render_device.create_buffer_with_data(&BufferInitDescriptor {
            label: Some("instance data buffer"),
            contents: bytemuck::cast_slice(instance_data.as_slice()),
            usage: BufferUsages::VERTEX | BufferUsages::COPY_DST,
        });

        // TODO: use storage buffer instead, then we can render in one draw call
        // Or, maybe pack matrix to fix 16 byte stride
        let cols = global_transform.to_cols_array();
        let mut uniform_buffers = vec![
            UniformBuffer::from(Vec4::new(cols[0], cols[1], cols[2], cols[3])),
            UniformBuffer::from(Vec4::new(cols[4], cols[5], cols[6], cols[7])),
            UniformBuffer::from(Vec4::new(cols[8], cols[9], cols[10], cols[11])),
            UniformBuffer::from(Vec4::new(cols[12], cols[13], cols[14], cols[15])),
        ];
        for uniform_buffer in uniform_buffers.iter_mut() {
            uniform_buffer.write_buffer(&render_device, &render_queue);
        }

        let transform_bind_group = render_device.create_bind_group(
            "transform_bind_group",
            &layout,
            &BindGroupEntries::with_indices((
                (0, &uniform_buffers[0]),
                (1, &uniform_buffers[1]),
                (2, &uniform_buffers[2]),
                (3, &uniform_buffers[3]),
            )),
        );

        commands.entity(entity).insert((
            InstanceBuffer {
                buffer,
                length: instance_data.len(),
            },
            TransformBindGroup(transform_bind_group),
        ));
    }

    let elapsed = start.elapsed();
    println!("Time taken to prepare instance buffers: {:?}", elapsed);
}

#[derive(Resource)]
struct CustomPipeline {
    shader: Handle<Shader>,
    mesh_pipeline: MeshPipeline,
    render_device: RenderDevice,
}

impl FromWorld for CustomPipeline {
    fn from_world(world: &mut World) -> Self {
        let mesh_pipeline = world.resource::<MeshPipeline>();
        let render_device = world.resource::<RenderDevice>();

        CustomPipeline {
            shader: world.load_asset(SHADER_ASSET_PATH),
            mesh_pipeline: mesh_pipeline.clone(),
            render_device: render_device.clone(),
        }
    }
}

impl SpecializedMeshPipeline for CustomPipeline {
    type Key = MeshPipelineKey;

    fn specialize(
        &self,
        key: Self::Key,
        layout: &MeshVertexBufferLayoutRef,
    ) -> Result<RenderPipelineDescriptor, SpecializedMeshPipelineError> {
        let mut descriptor = self.mesh_pipeline.specialize(key, layout)?;

        descriptor.vertex.shader = self.shader.clone();
        descriptor.vertex.buffers.push(VertexBufferLayout {
            array_stride: size_of::<InstanceData>() as u64,
            step_mode: VertexStepMode::Instance,
            attributes: vec![
                VertexAttribute {
                    format: VertexFormat::Uint32,
                    offset: 0,
                    shader_location: 3, // shader locations 0-2 are taken up by Position, Normal and UV attributes
                },
                VertexAttribute {
                    format: VertexFormat::Uint32,
                    offset: VertexFormat::Uint32.size(),
                    shader_location: 4,
                },
            ],
        });

        // Add uniform buffer binding
        let transform_layout = self.render_device.create_bind_group_layout(
            "transforms",
            &BindGroupLayoutEntries::with_indices(
                ShaderStages::VERTEX,
                (
                    (0, uniform_buffer::<Vec4>(false)),
                    (1, uniform_buffer::<Vec4>(false)),
                    (2, uniform_buffer::<Vec4>(false)),
                    (3, uniform_buffer::<Vec4>(false)),
                ),
            ),
        );
        descriptor.layout.push(transform_layout);
        descriptor.fragment.as_mut().unwrap().shader = self.shader.clone();
        Ok(descriptor)
    }
}

type DrawCustom = (
    SetItemPipeline,
    SetMeshViewBindGroup<0>,
    SetMeshBindGroup<1>,
    DrawMeshInstanced,
);

struct DrawMeshInstanced;

impl<P: PhaseItem> RenderCommand<P> for DrawMeshInstanced {
    type Param = (
        SRes<RenderAssets<RenderMesh>>,
        SRes<RenderMeshInstances>,
        SRes<MeshAllocator>,
    );
    type ViewQuery = ();
    type ItemQuery = (Read<InstanceBuffer>, Read<TransformBindGroup>);

    #[inline]
    fn render<'w>(
        item: &P,
        _view: (),
        buffers: Option<(&'w InstanceBuffer, &'w TransformBindGroup)>,
        (meshes, render_mesh_instances, mesh_allocator): SystemParamItem<'w, '_, Self::Param>,
        pass: &mut TrackedRenderPass<'w>,
    ) -> RenderCommandResult {
        // A borrow check workaround.
        let mesh_allocator = mesh_allocator.into_inner();

        let Some(mesh_instance) = render_mesh_instances.render_mesh_queue_data(item.main_entity())
        else {
            return RenderCommandResult::Skip;
        };
        let Some(gpu_mesh) = meshes.into_inner().get(mesh_instance.mesh_asset_id) else {
            return RenderCommandResult::Skip;
        };
        let Some(_buffers) = buffers else {
            return RenderCommandResult::Skip;
        };
        let Some(vertex_buffer_slice) =
            mesh_allocator.mesh_vertex_slice(&mesh_instance.mesh_asset_id)
        else {
            return RenderCommandResult::Skip;
        };

        let (instance_buffer, transform_bind_group) = buffers.unwrap();

        pass.set_vertex_buffer(0, vertex_buffer_slice.buffer.slice(..));
        pass.set_vertex_buffer(1, instance_buffer.buffer.slice(..));
        pass.set_bind_group(2, &transform_bind_group.0, &[]);

        match &gpu_mesh.buffer_info {
            RenderMeshBufferInfo::Indexed {
                index_format,
                count,
            } => {
                let Some(index_buffer_slice) =
                    mesh_allocator.mesh_index_slice(&mesh_instance.mesh_asset_id)
                else {
                    return RenderCommandResult::Skip;
                };

                pass.set_index_buffer(index_buffer_slice.buffer.slice(..), 0, *index_format);
                pass.draw_indexed(
                    index_buffer_slice.range.start..(index_buffer_slice.range.start + count),
                    vertex_buffer_slice.range.start as i32,
                    0..instance_buffer.length as u32,
                );
            }
            RenderMeshBufferInfo::NonIndexed => {
                pass.draw(vertex_buffer_slice.range, 0..instance_buffer.length as u32);
            }
        }
        RenderCommandResult::Success
    }
}
