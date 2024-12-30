use std::io::{ Read};
use bevy::prelude::{EventReader, FileDragAndDrop};
use bevy::prelude::*;
use bevy::{
    asset::{AssetLoader},
    prelude::*,
};
use crate::vxm::VxmAsset;

#[derive(Component)]
struct VoxelObject(Handle<VxmAsset>);

pub fn file_drag_and_drop_system(
    mut events: EventReader<FileDragAndDrop>,
    mut commands: Commands,
    ass: Res<AssetServer>
) {
    for event in events.read() {
        if let FileDragAndDrop::DroppedFile { window, path_buf } = event {
            let file_path = path_buf.to_str().unwrap().to_string();
            if file_path.ends_with(".vxm") {
                let voxels: Handle<VxmAsset> = ass.load(&file_path);
                commands.spawn(
                    VoxelObject(voxels),
                );
            }
        }
    }
}