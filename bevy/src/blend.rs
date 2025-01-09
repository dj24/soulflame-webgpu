use bevy::asset::{AssetLoader, LoadContext};
use bevy::asset::io::Reader;
use bevy::log::info;
use bevy::prelude::{Gltf};
use bevy::utils::ConditionalSendFuture;
use thiserror::Error;
use crate::vxm::VxmAssetLoader;

#[derive(Default)]
pub struct BlenderAssetLoader;

/// Possible errors that can be produced by [`BlenderAssetLoader`]
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum BlenderAssetLoaderError {
    /// An [IO](std::io) Error
    #[error("Could not load asset: {0}")]
    Io(#[from] std::io::Error),
}

impl AssetLoader for BlenderAssetLoader {
    type Asset = Gltf;
    type Settings = ();
    type Error = BlenderAssetLoaderError;

    fn load(&self, reader: &mut dyn Reader, settings: &Self::Settings, load_context: &mut LoadContext) -> impl ConditionalSendFuture<Output = Result<Self::Asset, Self::Error>> {
        let path = load_context.path().to_str().unwrap();
        info!("Loading Blender file: {}", path);
        todo!()

    }
    
    fn extensions(&self) -> &[&str] {
        &["blend"]
    }
}