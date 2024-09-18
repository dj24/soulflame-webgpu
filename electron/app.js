const { app, BrowserWindow } = require("electron");
const { join } = require("path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    icon: join(__dirname, "fire-icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      enableRemoteModule: false,
    },
  });

  // win.removeMenu();

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
    details.responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
    callback({ responseHeaders: details.responseHeaders });
  });

  win.loadFile("../dist/index.html");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
