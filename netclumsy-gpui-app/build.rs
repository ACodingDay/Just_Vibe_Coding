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
        // 修复：原先静默 `return`，推导失败时 DLL/SYS 一个都不复制，
        // 构建照样"成功"，exe 双击却因找不到 WinDivert.dll 直接起不来。
        fail("无法从 OUT_DIR 推导 profile 输出目录，未复制 WinDivert 运行时");
    };

    let windivert_dir = Path::new("windivert/WinDivert-2.2.2-A/x64");
    for file in &["WinDivert64.sys", "WinDivert.dll"] {
        let src = windivert_dir.join(file);
        if !src.exists() {
            fail(&format!(
                "缺少 {}：WinDivert 发行包未就位（发布包脚本还会用到 etc/config.txt）",
                src.display()
            ));
        }
        copy_to(&src, &profile_dir.join(file));
    }

    // cargo run 场景下 presets::load() 读的是 exe 同目录 config.txt；发布包由
    // script/package.ps1 负责复制。这里只在开发输出目录缺文件时补一份，
    // 已有则不覆盖（允许就地改预设）。
    let shipped_config = Path::new("etc/config.txt");
    let local_config = profile_dir.join("config.txt");
    if shipped_config.exists() && !local_config.exists() {
        copy_to(shipped_config, &local_config);
    }

    // 告诉 cargo：windivert 目录变化时重新执行
    println!("cargo:rerun-if-changed=windivert");
    println!("cargo:rerun-if-changed=build.rs");
}

fn copy_to(src: &Path, dst: &Path) {
    // 修复：原先 `let _ = fs::copy(...)` 吞掉一切错误。最典型的触发场景是
    // exe 还在运行时重新构建：目标文件被占用（os error 32 共享冲突），
    // 复制失败却无人知晓，于是**新 exe 配旧 DLL/SYS**，之后所有奇怪的加载
    // 失败都无从排查。复制失败必须让构建失败。
    if let Err(e) = fs::copy(src, dst) {
        fail(&format!("复制 {} → {} 失败: {e}", src.display(), dst.display()));
    }
}

/// 让构建以可读的原因失败。
///
/// `cargo:error=` 是给 cargo 的结构化错误行，非 0 退出是兜底 ——
/// 两者都做，任何 cargo 版本下都不可能退化成"静默跳过"。
fn fail(msg: &str) -> ! {
    println!("cargo:error={msg}");
    eprintln!("build.rs: {msg}");
    std::process::exit(1);
}
