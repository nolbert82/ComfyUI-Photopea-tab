# ComfyUI Photopea Tab Implementation

A custom extension for ComfyUI that integrates **Photopea**, a powerful web-based photo editor, directly into the sidebar.

## Key Features
- **Sidebar Integration**: Access Photopea instantly from the new ComfyUI sidebar.
- **Dark Mode Support**: Automatically themed to match ComfyUI's dark aesthetics.
- **One-Click Edit**: Right-click any node with an image (like PreviewImage, SaveImage, or LoadImage) and select **"Open in Photopea"**.
- **Bidirectional Sync**: Right-click a `LoadImage` node and select **"Import from Photopea"** to retrieve your edited image directly into the node.

## Project Structure
- `__init__.py`: Essential for ComfyUI to recognize the directory as a custom node and serve the JavaScript files.
- `js/photopea.js`: The core logic that registers the sidebar tab, handles image transfers via the Photopea API (`postMessage`), and integrates with the ComfyUI context menu.

## How to Use
1. **Open Photopea**: Click the palette icon in the sidebar.
2. **Edit Images**: Right-click a node with an image and select **"Open in Photopea"**. The image will be loaded into the editor.
3. **Save Back**: Right-click a `LoadImage` node in your graph and select **"Import from Photopea"**. The edited image will be fetched from the editor and assigned to the node. You can also select multiple `LoadImage` nodes and trigger the import to update all of them at once.