import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { setCloseToTrayCache } from "@/lib/closeTrayCache";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";

function persistSetting(key: string, value: unknown) {
  load("settings.json").then((store) => {
    store.set(key, value);
    store.save();
  });
}

export function NotificationPanel() {
  const [notifyScan, setNotifyScan] = useState(true);
  const [closeToTray, setCloseToTray] = useState(false);

  useEffect(() => {
    load("settings.json").then((store) => {
      store.get<boolean>("notify_scan_complete").then((v) => {
        if (v !== null && v !== undefined) setNotifyScan(v);
      });
      store.get<boolean>("close_to_tray").then((v) => {
        if (v !== null && v !== undefined) setCloseToTray(v);
      });
    });
  }, []);

  function handleNotifyScanChange(checked: boolean) {
    setNotifyScan(checked);
    persistSetting("notify_scan_complete", checked);
  }

  function handleCloseToTrayChange(checked: boolean) {
    setCloseToTray(checked);
    setCloseToTrayCache(checked);
    persistSetting("close_to_tray", checked);
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-foreground">通知设置</h3>
      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>扫描完成通知</ItemTitle>
          <ItemDescription>发送系统通知</ItemDescription>
        </ItemContent>
        <Switch checked={notifyScan} onCheckedChange={handleNotifyScanChange} />
      </Item>
      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>关闭窗口时最小化到托盘</ItemTitle>
          <ItemDescription>
            点击关闭按钮时不退出，隐藏到系统托盘
          </ItemDescription>
        </ItemContent>
        <Switch
          checked={closeToTray}
          onCheckedChange={handleCloseToTrayChange}
        />
      </Item>
    </div>
  );
}
