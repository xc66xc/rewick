# 掌灯 Rewick 图标

`rewick-icon-source.png` 是用户确认的蓝底 R 与镂空灯火原图，保留透明边缘。界面与安装图标均由该图等比缩放生成，不重新绘制。

在 macOS 仓库根目录执行：

```sh
node frontend/scripts/create-brand-icons.mjs
```

生成桌面 ICNS、包含 16/32/48/64/128/256 像素的 Windows ICO、桌面界面图片、管理后台与落地页图片和 favicon。脚本依赖系统 `sips`、`iconutil`。重新生成后需重新构建/打包或部署对应模块；旧安装包不会自动更新。
