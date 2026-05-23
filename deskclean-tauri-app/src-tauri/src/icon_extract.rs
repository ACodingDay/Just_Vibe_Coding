// 提取系统文件图标（Win32 FFI → PNG）

#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
mod imp {
    use std::collections::HashMap;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::Mutex;

    extern "system" {
        fn SHGetFileInfoW(
            pszPath: *const u16,
            dwFileAttributes: u32,
            psfi: *mut SHFILEINFOW,
            cbFileInfo: u32,
            uFlags: u32,
        ) -> usize;
        fn GetIconInfo(hIcon: isize, piconinfo: *mut ICONINFO) -> i32;
        fn DestroyIcon(hIcon: isize) -> i32;
        fn DeleteObject(ho: isize) -> i32;
        fn CreateCompatibleDC(hdc: isize) -> isize;
        fn DeleteDC(hdc: isize) -> i32;
        fn CreateDIBSection(
            hdc: isize,
            pbmi: *const BITMAPINFO,
            usage: u32,
            ppvBits: *mut *mut u8,
            hSection: isize,
            offset: u32,
        ) -> isize;
        fn SelectObject(hdc: isize, h: isize) -> isize;
        fn DrawIconEx(
            hdc: isize,
            xLeft: i32,
            yTop: i32,
            hIcon: isize,
            cxWidth: i32,
            cyWidth: i32,
            istepIfAniCur: u32,
            hbrFlickerFreeDraw: isize,
            diFlags: u32,
        ) -> i32;
    }

    #[repr(C)]
    struct SHFILEINFOW {
        hIcon: isize,
        iIcon: i32,
        dwAttributes: u32,
        szDisplayName: [u16; 260],
        szTypeName: [u16; 80],
    }

    #[repr(C)]
    struct ICONINFO {
        fIcon: i32,
        xHotspot: u32,
        yHotspot: u32,
        hbmMask: isize,
        hbmColor: isize,
    }

    #[repr(C)]
    struct BITMAPINFOHEADER {
        biSize: u32,
        biWidth: i32,
        biHeight: i32,
        biPlanes: u16,
        biBitCount: u16,
        biCompression: u32,
        biSizeImage: u32,
        biXPelsPerMeter: i32,
        biYPelsPerMeter: i32,
        biClrUsed: u32,
        biClrImportant: u32,
    }

    #[repr(C)]
    struct BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER,
    }

    const SHGFI_ICON: u32 = 0x000000100;
    const SHGFI_LARGEICON: u32 = 0x000000000;
    const DIB_RGB_COLORS: u32 = 0;
    const DI_NORMAL: u32 = 0x0003;
    const BI_RGB: u32 = 0;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn extract_icon_png(path: &str, size: u32) -> Result<Vec<u8>, String> {
        let cache_key = format!("{path}|{size}");
        {
            let cache = ICON_CACHE.lock().unwrap();
            if let Some(data) = cache.get(&cache_key) {
                return Ok(data.clone());
            }
        }

        let data = extract_icon_impl(path, size)?;

        {
            let mut cache = ICON_CACHE.lock().unwrap();
            if cache.len() > 256 {
                cache.clear();
            }
            cache.insert(cache_key, data.clone());
        }

        Ok(data)
    }

    fn extract_icon_impl(path: &str, size: u32) -> Result<Vec<u8>, String> {
        unsafe {
            let wide_path = to_wide(path);

            let mut shfi: SHFILEINFOW = std::mem::zeroed();
            let ret = SHGetFileInfoW(
                wide_path.as_ptr(),
                0,
                &mut shfi,
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );
            if ret == 0 || shfi.hIcon == 0 {
                return Err("SHGetFileInfo 失败".into());
            }

            let hicon = shfi.hIcon;

            let mut ii: ICONINFO = std::mem::zeroed();
            if GetIconInfo(hicon, &mut ii) == 0 {
                DestroyIcon(hicon);
                return Err("GetIconInfo 失败".into());
            }

            let w = size as i32;
            let h = size as i32;

            let bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB,
                    biSizeImage: (w * h * 4) as u32,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
            };

            let dc = CreateCompatibleDC(0);
            if dc == 0 {
                DestroyIcon(hicon);
                return Err("CreateCompatibleDC 失败".into());
            }

            let mut bits: *mut u8 = std::ptr::null_mut();
            let dib = CreateDIBSection(
                dc,
                &bi,
                DIB_RGB_COLORS,
                &mut bits as *mut *mut u8,
                0,
                0,
            );
            if dib == 0 || bits.is_null() {
                DeleteDC(dc);
                DestroyIcon(hicon);
                return Err("CreateDIBSection 失败".into());
            }

            let old_bmp = SelectObject(dc, dib);

            if DrawIconEx(dc, 0, 0, hicon, w, h, 0, 0, DI_NORMAL) == 0 {
                SelectObject(dc, old_bmp);
                DeleteObject(dib);
                DeleteDC(dc);
                DestroyIcon(hicon);
                return Err("DrawIconEx 失败".into());
            }

            let byte_count = (w * h * 4) as usize;
            let pixels = std::slice::from_raw_parts(bits, byte_count);

            let mut rgba = Vec::with_capacity(byte_count);
            for chunk in pixels.chunks(4) {
                rgba.push(chunk[2]);
                rgba.push(chunk[1]);
                rgba.push(chunk[0]);
                rgba.push(chunk[3]);
            }

            let mut png_bytes: Vec<u8> = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut png_bytes, w as u32, h as u32);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);
                let mut writer = encoder
                    .write_header()
                    .map_err(|e| format!("PNG 头: {e}"))?;
                writer
                    .write_image_data(&rgba)
                    .map_err(|e| format!("PNG 数据: {e}"))?;
            }

            SelectObject(dc, old_bmp);
            DeleteObject(dib);
            DeleteDC(dc);

            if ii.hbmColor != 0 {
                DeleteObject(ii.hbmColor);
            }
            if ii.hbmMask != 0 {
                DeleteObject(ii.hbmMask);
            }
            DestroyIcon(hicon);

            Ok(png_bytes)
        }
    }

    use std::sync::LazyLock;
    static ICON_CACHE: LazyLock<Mutex<HashMap<String, Vec<u8>>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn extract_icon_png(_path: &str, _size: u32) -> Result<Vec<u8>, String> {
        Ok(Vec::new())
    }
}

pub use imp::extract_icon_png;

#[tauri::command]
pub async fn get_file_icon(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = extract_icon_png(&path, 48);
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    let png_bytes = tauri::async_runtime::spawn_blocking(move || {
        rx.recv().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    let png_bytes = png_bytes?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}
