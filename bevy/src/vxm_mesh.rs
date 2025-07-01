use crate::color_conversion::get_hsl_voxel;
use crate::render::main::{InstanceData, InstanceMaterialData};
use crate::vxm::{PendingVxm, VxmAsset, VxmVoxel};
use bevy::asset::{Assets, RenderAssetUsages};
use bevy::log::info;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};
use bevy::render::primitives::Aabb;
use bevy::render::view::VisibilityClass;
use rayon::prelude::*;
use std::sync::Arc;

#[derive(Component, Clone)]
#[component(on_add = bevy::render::view::visibility::add_visibility_class::<MeshedVoxelsFace>)]
pub enum MeshedVoxelsFace {
    Back = 0,
    Front = 1,
    Left = 2,
    Right = 3,
    Bottom = 4,
    Top = 5,
}

fn generate_instance_data_z(vxm: &VxmAsset, is_front_face: bool) -> Vec<InstanceData> {
    let size_x = vxm.size[0] as usize;
    let size_y = vxm.size[1] as usize;
    let size_z = vxm.size[2] as usize;

    let idx = |x, y, z| x * size_y * size_z + y * size_z + z;

    let mut visited_voxels = vec![false; size_x * size_y * size_z];

    // Create a closure for checking voxels
    let check_voxel = |visited_voxels: &Vec<bool>, x: usize, y: usize, z: usize, hsl: u16| {
        let is_face_hidden = if is_front_face {
            z < (vxm.size[2] - 1) as usize && is_solid_voxel(&vxm.voxel_array[x][y][z + 1])
        } else {
            z > 0 && is_solid_voxel(&vxm.voxel_array[x][y][z - 1])
        };

        let is_visited = visited_voxels[idx(x, y, z)];

        !is_solid_voxel(&vxm.voxel_array[x][y][z])
            || vxm.voxel_array[x][y][z].hsl != hsl
            || is_visited
            || is_face_hidden
    };

    let mut instance_data =
        Vec::with_capacity(vxm.size[0] as usize * vxm.size[1] as usize * vxm.size[2] as usize / 4);

    (0..vxm.size[2] as usize).into_iter().for_each(|z| {
        for x in 0..vxm.size[0] as usize {
            for y in 0..vxm.size[1] as usize {
                let voxel = &vxm.voxel_array[x][y][z];

                if check_voxel(&visited_voxels, x, y, z, voxel.hsl) {
                    continue;
                }

                let mut x_extent = 1u8;
                let mut y_extent = 1u8;
                let max_extent_y = vxm.size[1] as usize - y;
                let max_extent_x = vxm.size[0] as usize - x;

                let mut is_x_extendable = true;
                let mut is_y_extendable = true;

                while (is_x_extendable || is_y_extendable)
                    && ((x_extent as usize) < max_extent_x)
                    && ((y_extent as usize) < max_extent_y)
                {
                    is_x_extendable = !(0..y_extent as usize)
                        .any(|dy| check_voxel(&visited_voxels, x + x_extent as usize, y + dy, z, voxel.hsl));
                    if is_x_extendable {
                        x_extent += 1;
                    }

                    is_y_extendable = !(0..x_extent as usize)
                        .any(|dx| check_voxel(&visited_voxels, x + dx, y + y_extent as usize, z, voxel.hsl));
                    if is_y_extendable {
                        y_extent += 1;
                    }
                }

                for dx in 0..x_extent as usize {
                    for dy in 0..y_extent as usize {
                        visited_voxels[idx(x + dx, y + dy, z)] = true;
                    }
                }

                let (r, g, b) = get_hsl_voxel(voxel);

                instance_data.push(InstanceData {
                    position: [x as u8, y as u8, z as u8],
                    width: x_extent,
                    height: y_extent,
                    color: [r as u8, g as u8, b as u8],
                });
            }
        }
    });
    instance_data
}

// Checks if 1st bit of 16 bit value is 1
fn is_solid_voxel(voxel: &VxmVoxel) -> bool {
    (voxel.hsl >> 15) & 0x01 == 1
}

fn generate_instance_data_x(vxm: &VxmAsset, is_right_face: bool) -> Vec<InstanceData> {
    let size_x = vxm.size[0] as usize;
    let size_y = vxm.size[1] as usize;
    let size_z = vxm.size[2] as usize;

    let idx = |x, y, z| x * size_y * size_z + y * size_z + z;

    let mut visited_voxels = vec![false; size_x * size_y * size_z];

    // Create a closure for checking voxels
    let check_voxel = |visited_voxels: &Vec<bool>, x: usize, y: usize, z: usize, hsl: u16| {
        let is_face_hidden = if is_right_face {
            x < (vxm.size[0] - 1) as usize && is_solid_voxel(&vxm.voxel_array[x + 1][y][z])
        } else {
            x > 0 && is_solid_voxel(&vxm.voxel_array[x - 1][y][z])
        };

        let is_visited = visited_voxels[idx(x, y, z)];

        !is_solid_voxel(&vxm.voxel_array[x][y][z])
            || vxm.voxel_array[x][y][z].hsl != hsl
            || is_visited
            || is_face_hidden
    };

    let mut instance_data =
        Vec::with_capacity(vxm.size[0] as usize * vxm.size[1] as usize * vxm.size[2] as usize / 4);

    (0..vxm.size[0] as usize).into_iter().for_each(|x| {
        for z in 0..vxm.size[2] as usize {
            for y in 0..vxm.size[1] as usize {
                let voxel = &vxm.voxel_array[x][y][z];

                if check_voxel(&visited_voxels, x, y, z, voxel.hsl) {
                    continue;
                }

                let mut z_extent = 1u8;
                let mut y_extent = 1u8;
                let max_extent_y = vxm.size[1] as usize - y;
                let max_extent_z = vxm.size[2] as usize - z;

                let mut is_z_extendable = true;
                let mut is_y_extendable = true;

                while (is_z_extendable || is_y_extendable)
                    && ((z_extent as usize) < max_extent_z)
                    && ((y_extent as usize) < max_extent_y)
                {
                    is_z_extendable = !(0..y_extent as usize)
                        .any(|dy| check_voxel(&visited_voxels, x, y + dy, z + z_extent as usize, voxel.hsl));
                    if is_z_extendable {
                        z_extent += 1;
                    }

                    is_y_extendable = !(0..z_extent as usize)
                        .any(|dz| check_voxel(&visited_voxels, x, y + y_extent as usize, z + dz, voxel.hsl));
                    if is_y_extendable {
                        y_extent += 1;
                    }
                }

                for dz in 0..z_extent as usize {
                    for dy in 0..y_extent as usize {
                        visited_voxels[idx(x, y + dy, z + dz)] = true;
                    }
                }

                let (r, g, b) = get_hsl_voxel(voxel);

                instance_data.push(InstanceData {
                    position: [x as u8, y as u8, z as u8],
                    width: y_extent,
                    height: z_extent,
                    color: [r as u8, g as u8, b as u8],
                });
            }
        }
    });
    instance_data
}

fn generate_instance_data_y(vxm: &VxmAsset, is_top_face: bool) -> Vec<InstanceData> {
    let size_x = vxm.size[0] as usize;
    let size_y = vxm.size[1] as usize;
    let size_z = vxm.size[2] as usize;

    let idx = |x, y, z| x * size_y * size_z + y * size_z + z;

    let mut visited_voxels = vec![false; size_x * size_y * size_z];

    // Create a closure for checking voxels
    let check_voxel = |visited_voxels: &Vec<bool>, x: usize, y: usize, z: usize, hsl: u16| {
        let is_face_hidden = if is_top_face {
            y < (vxm.size[1] - 1) as usize && is_solid_voxel(&vxm.voxel_array[x][y + 1][z])
        } else {
            y > 0 && is_solid_voxel(&vxm.voxel_array[x][y - 1][z])
        };

        let is_visited = visited_voxels[idx(x, y, z)];

        !is_solid_voxel(&vxm.voxel_array[x][y][z])
            || vxm.voxel_array[x][y][z].hsl != hsl
            || is_visited
            || is_face_hidden
    };

    let mut instance_data =
        Vec::with_capacity(vxm.size[0] as usize * vxm.size[1] as usize * vxm.size[2] as usize / 4);

    (0..vxm.size[1] as usize).into_iter().for_each(|y| {
        for x in 0..vxm.size[0] as usize {
            for z in 0..vxm.size[2] as usize {
                let voxel = &vxm.voxel_array[x][y][z];

                if check_voxel(&visited_voxels, x, y, z, voxel.hsl) {
                    continue;
                }

                let mut x_extent = 1u8;
                let mut z_extent = 1u8;
                let max_extent_z = vxm.size[2] as usize - z;
                let max_extent_x = vxm.size[0] as usize - x;

                let mut is_x_extendable = true;
                let mut is_z_extendable = true;

                while (is_x_extendable || is_z_extendable)
                    && ((x_extent as usize) < max_extent_x)
                    && ((z_extent as usize) < max_extent_z)
                {
                    is_x_extendable = !(0..z_extent as usize)
                        .any(|dz| check_voxel(&visited_voxels, x + x_extent as usize, y, z + dz, voxel.hsl));
                    if is_x_extendable {
                        x_extent += 1;
                    }

                    is_z_extendable = !(0..x_extent as usize)
                        .any(|dx| check_voxel(&visited_voxels, x + dx, y, z + z_extent as usize, voxel.hsl));
                    if is_z_extendable {
                        z_extent += 1;
                    }
                }

                for dx in 0..x_extent as usize {
                    for dz in 0..z_extent as usize {
                        visited_voxels[idx(x + dx, y, z + dz)] = true;
                    }
                }

                let (r, g, b) = get_hsl_voxel(voxel);

                instance_data.push(InstanceData {
                    position: [x as u8, y as u8, z as u8],
                    width: x_extent,
                    height: z_extent,
                    color: [r as u8, g as u8, b as u8],
                });
            }
        }
    });
    instance_data
}

#[derive(Component)]
pub struct MeshedVoxels;

/// Removes PendingVxm to signify that the mesh has been created
pub fn create_mesh_on_vxm_import_system(
    pending_vxms: Query<(Entity, &PendingVxm, &Transform)>,
    vxm_assets: Res<Assets<VxmAsset>>,
    mut commands: Commands,
) {
    for (entity, pending_vxm, _) in pending_vxms.iter() {
        match vxm_assets.get(&pending_vxm.0) {
            Some(vxm) => {
                let start_time = std::time::Instant::now();

                let ((z_instance_data, x_instance_data), y_instance_data) = rayon::join(
                    || {
                        rayon::join(
                            || {
                                rayon::join(
                                    || generate_instance_data_z(vxm, false),
                                    || generate_instance_data_z(vxm, true),
                                )
                            },
                            || {
                                rayon::join(
                                    || generate_instance_data_x(vxm, false),
                                    || generate_instance_data_x(vxm, true),
                                )
                            },
                        )
                    },
                    || {
                        rayon::join(
                            || generate_instance_data_y(vxm, true),
                            || generate_instance_data_y(vxm, false),
                        )
                    },
                );

                let (back_instance_data, front_instance_data) = z_instance_data;
                let (left_instance_data, right_instance_data) = x_instance_data;
                let (top_instance_data, bottom_instance_data) = y_instance_data;

                let instance_count = front_instance_data.len()
                    + back_instance_data.len()
                    + left_instance_data.len()
                    + right_instance_data.len()
                    + top_instance_data.len()
                    + bottom_instance_data.len();

                let end_time = start_time.elapsed();

                info!(
                    "{:?} size mesh created {:?} instances using {:?}kb in {:?}ms",
                    vxm.size,
                    instance_count,
                    (size_of::<InstanceData>() * instance_count) / 1024,
                    end_time.as_micros() as f32 / 1000.0
                );

                if instance_count == 0 {
                    info!("No instances created, skipping mesh creation");
                    return;
                }

                let aabb = Aabb::from_min_max(
                    Vec3::ZERO,
                    Vec3::new(vxm.size[0] as f32, vxm.size[1] as f32, vxm.size[2] as f32),
                );

                info!("AABB: {:?}", aabb);

                for light in &vxm.lights {
                    let light_size = Vec3::new(
                        light.max_pos[0] as f32,
                        light.max_pos[1] as f32,
                        light.max_pos[2] as f32,
                    ) - Vec3::new(
                        light.min_pos[0] as f32,
                        light.min_pos[1] as f32,
                        light.min_pos[2] as f32,
                    );

                    let light_center = Vec3::new(
                        light.min_pos[0] as f32,
                        light.min_pos[1] as f32,
                        light.min_pos[2] as f32,
                    ) + light_size / 2.0;

                    info!("Light: {:?}", light_center);

                    let child = commands
                        .spawn((
                            PointLight {
                                color: Color::srgb(light.color[0], light.color[1], light.color[2]),
                                intensity: light.intensity,
                                range: light.intensity,
                                ..default()
                            },
                            Transform::from_xyz(light_center.x, light_center.y, light_center.z),
                        ))
                        .id();

                    commands.entity(entity).add_child(child);
                }

                commands.entity(entity).remove::<PendingVxm>();
                commands
                    .entity(entity)
                    .insert((
                        aabb,
                        MeshedVoxels,
                        Visibility::Visible,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Front face instance data"),
                        MeshedVoxelsFace::Front,
                        InstanceMaterialData(Arc::new(front_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Back face instance data"),
                        MeshedVoxelsFace::Back,
                        InstanceMaterialData(Arc::new(back_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Right face instance data"),
                        MeshedVoxelsFace::Right,
                        InstanceMaterialData(Arc::new(right_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Left face instance data"),
                        MeshedVoxelsFace::Left,
                        InstanceMaterialData(Arc::new(left_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Top face instance data"),
                        MeshedVoxelsFace::Top,
                        InstanceMaterialData(Arc::new(top_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ))
                    .with_child((
                        Name::new("Bottom face instance data"),
                        MeshedVoxelsFace::Bottom,
                        InstanceMaterialData(Arc::new(bottom_instance_data.clone())),
                        Transform::from_xyz(0.0, 0.0, 0.0),
                        Visibility::Inherited,
                        InheritedVisibility::VISIBLE,
                        ViewVisibility::default(),
                    ));
            }
            None => {}
        }
    }
}
