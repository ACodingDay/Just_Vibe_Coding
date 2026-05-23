// 解析 .lnk 快捷方式目标路径（COM IShellLinkW FFI）

#[cfg(target_os = "windows")]
mod imp {
    use std::ffi::c_void;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[repr(C)]
    struct GUID {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct IShellLinkW {
        lpVtbl: *const IShellLinkWVtbl,
    }

    #[repr(C)]
    struct IShellLinkWVtbl {
        query_interface: unsafe extern "system" fn(*mut IShellLinkW, *const GUID, *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut IShellLinkW) -> u32,
        release: unsafe extern "system" fn(*mut IShellLinkW) -> u32,
        get_path: unsafe extern "system" fn(*mut IShellLinkW, *mut u16, i32, *mut c_void, u32) -> i32,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct IPersistFile {
        lpVtbl: *const IPersistFileVtbl,
    }

    #[repr(C)]
    struct IPersistFileVtbl {
        query_interface: unsafe extern "system" fn(*mut IPersistFile, *const GUID, *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut IPersistFile) -> u32,
        release: unsafe extern "system" fn(*mut IPersistFile) -> u32,
        get_class_id: unsafe extern "system" fn(*mut IPersistFile, *mut GUID) -> i32,
        is_dirty: unsafe extern "system" fn(*mut IPersistFile) -> i32,
        load: unsafe extern "system" fn(*mut IPersistFile, *const u16, u32) -> i32,
    }

    const CLSID_SHELL_LINK: GUID = GUID {
        data1: 0x00021401,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    const IID_ISHELL_LINK_W: GUID = GUID {
        data1: 0x000214F9,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    const IID_IPERSIST_FILE: GUID = GUID {
        data1: 0x0000010B,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    const CLSCTX_INPROC_SERVER: u32 = 1;
    const SLGP_RAWPATH: u32 = 0x00000004;
    const STGM_READ: u32 = 0x00000000;

    extern "system" {
        fn CoCreateInstance(
            rclsid: *const GUID,
            pUnkOuter: *mut c_void,
            dwClsContext: u32,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> i32;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn resolve_lnk_target(path: &str) -> Option<String> {
        unsafe {
            let mut shell_link_raw: *mut c_void = std::ptr::null_mut();
            let hr = CoCreateInstance(
                &CLSID_SHELL_LINK,
                std::ptr::null_mut(),
                CLSCTX_INPROC_SERVER,
                &IID_ISHELL_LINK_W,
                &mut shell_link_raw,
            );
            if hr < 0 || shell_link_raw.is_null() {
                return None;
            }

            let shell_link = shell_link_raw as *mut IShellLinkW;

            let mut persist_raw: *mut c_void = std::ptr::null_mut();
            let hr = ((*(*shell_link).lpVtbl).query_interface)(
                shell_link,
                &IID_IPERSIST_FILE,
                &mut persist_raw,
            );
            if hr < 0 || persist_raw.is_null() {
                ((*(*shell_link).lpVtbl).release)(shell_link);
                return None;
            }

            let persist = persist_raw as *mut IPersistFile;

            let wide_path = to_wide(path);
            let hr = ((*(*persist).lpVtbl).load)(persist, wide_path.as_ptr(), STGM_READ);
            if hr < 0 {
                ((*(*persist).lpVtbl).release)(persist);
                ((*(*shell_link).lpVtbl).release)(shell_link);
                return None;
            }

            let mut buf = vec![0u16; 1024];
            let hr = ((*(*shell_link).lpVtbl).get_path)(
                shell_link,
                buf.as_mut_ptr(),
                buf.len() as i32,
                std::ptr::null_mut(),
                SLGP_RAWPATH,
            );

            let result = if hr >= 0 {
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                let target = String::from_utf16(&buf[..len]).ok()?;
                if target.is_empty() { None } else { Some(target) }
            } else {
                None
            };

            ((*(*persist).lpVtbl).release)(persist);
            ((*(*shell_link).lpVtbl).release)(shell_link);

            result
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn resolve_lnk_target(_path: &str) -> Option<String> {
        None
    }
}

pub use imp::resolve_lnk_target;
