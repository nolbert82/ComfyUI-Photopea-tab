# ComfyUI Photopea Tab Implementation

I have implemented a custom extension for ComfyUI that integrates **Photopea**, a powerful web-based photo editor, directly into the sidebar.

## Key Features
- **Sidebar Integration**: Access Photopea instantly from the new ComfyUI sidebar.
- **Dark Mode Support**: Automatically themed to match ComfyUI's dark aesthetics.
- **One-Click Edit**: Right-click any node with an image (like PreviewImage, SaveImage, or LoadImage) and select **"Open in Photopea"**.
- **Bidirectional Sync**: Use the **"Import to Selected LoadImage"** button in the Photopea sidebar to send your edited image back to all currently selected `LoadImage` nodes in your workflow.

## Project Structure
- `__init__.py`: Essential for ComfyUI to recognize the directory as a custom node and serve the JavaScript files.
- `js/photopea.js`: The core logic that registers the sidebar tab, handles image transfers via the Photopea API (`postMessage`), and integrates with the ComfyUI context menu.

## How to Use
1. **Open Photopea**: Click the palette icon in the sidebar.
2. **Edit Images**: Right-click a node with an image and select **"Open in Photopea"**. The image will be loaded into the editor.
3. **Save Back**: Select a `LoadImage` node in your graph, then click **"Import to Selected LoadImage"** in the Photopea sidebar tab. The edited image will be uploaded and assigned to the node.

## Technical Details
- Uses `app.extensionManager.registerSidebarTab` for seamless UI integration.
- Leverages the [Photopea Live API](https://www.photopea.com/api/live) for secure cross-origin communication.
- Implements the new ComfyUI Context Menu API for future-proof compatibility.
