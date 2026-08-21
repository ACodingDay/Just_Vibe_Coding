use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // WinDivert 运行时依赖 WinDivert64.sys + WinDivert.dll，
    // 必须与 exe 同目录。build.rs 在编译后自动复制到输出目录。
    let out_dir = env::var("OUT_DIR").unwrap();
    // OUT_DIR = target/debug/build/<pkg>-<hash>/out
    // 我们需要 target/debug/
    let profile_dir = Path::new(&out_dir)
        .parent() // build/<pkg>-<hash>
        .and_then(|p| p.parent()) // build
        .and_then(|p| p.parent()); // target/debug or target/release
    let Some(profile_dir) = profile_dir else {
        return;
    };

    let windivert_dir = Path::new("windivert/WinDivert-2.2.2-A/x64");
    for file in &["WinDivert64.sys", "WinDivert.dll"] {
        let src = windivert_dir.join(file);
        let dst = profile_dir.join(file);
        if src.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }

    // 告诉 cargo：windivert 目录变化时重新执行
    println!("cargo:rerun-if-changed=windivert");
    println!("cargo:rerun-if-changed=build.rs");
}
