use livekit::webrtc::audio_source::{AudioSourceOptions, native::NativeAudioSource};

pub fn init_webrtc() {
    let _source = NativeAudioSource::new(AudioSourceOptions::default(), 48_000, 1, 100);
}
