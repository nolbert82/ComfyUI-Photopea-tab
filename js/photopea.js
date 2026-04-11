import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PhotopeaTab",
    async setup() {
        if (!app.extensionManager?.registerSidebarTab) {
            console.warn("Sidebar Tab API not available. This extension requires a newer version of ComfyUI.");
            return;
        }

        let photopeaWindow = null;

        const config = {
            "environment": {
                "theme": 2, // Dark theme
                "intro": false,
                "vmode": 0,
                "api": true // Enable API mode
            }
        };
        const encodedConfig = encodeURIComponent(JSON.stringify(config));

        // Listen for messages from Photopea
        window.addEventListener("message", async (e) => {
            if (photopeaWindow && e.source === photopeaWindow) {
                if (e.data instanceof ArrayBuffer) {
                    // Export from Photopea received
                    console.log("Photopea export received", e.data);
                    
                    const formData = new FormData();
                    formData.append("image", new Blob([e.data]), "photopea_export.png");
                    formData.append("overwrite", "true");
                    
                    try {
                        const response = await fetch("/upload/image", {
                            method: "POST",
                            body: formData
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            console.log("Uploaded Photopea image:", result.name);
                            
                            // Find selected LoadImage nodes and update them
                            const selectedNodes = app.canvas.selected_nodes;
                            for (const id in selectedNodes) {
                                const node = selectedNodes[id];
                                if (node.comfyClass === "LoadImage") {
                                    const widget = node.widgets.find(w => w.name === "image");
                                    if (widget) {
                                        widget.value = result.name;
                                        node.onWidgetChanged?.("image", result.name);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error uploading image from Photopea:", err);
                    }
                }
            }
        });

        app.extensionManager.registerSidebarTab({
            id: "photopea-sidebar-tab",
            icon: "pi pi-palette",
            title: "Photopea",
            tooltip: "Photopea Photo Editor",
            type: "custom",
            render: (el) => {
                el.style.display = "flex";
                el.style.flexDirection = "column";
                el.style.height = "100%";
                el.style.width = "100%";
                el.style.padding = "0";

                const toolbar = document.createElement("div");
                toolbar.style.display = "flex";
                toolbar.style.padding = "5px";
                toolbar.style.gap = "5px";
                toolbar.style.background = "#222";

                const importBtn = document.createElement("button");
                importBtn.innerText = "Import to Selected LoadImage";
                importBtn.style.flex = "1";
                importBtn.style.cursor = "pointer";
                importBtn.onclick = () => {
                    if (photopeaWindow) {
                        // Request export from Photopea
                        photopeaWindow.postMessage("app.activeDocument.saveToOE('png')", "*");
                    }
                };
                
                toolbar.appendChild(importBtn);
                el.appendChild(toolbar);

                const iframe = document.createElement("iframe");
                iframe.src = `https://www.photopea.com#${encodedConfig}`;
                iframe.style.flex = "1";
                iframe.style.border = "none";
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.allow = "clipboard-read; clipboard-write; shift-ctrl-copy-paste";
                
                el.appendChild(iframe);
                photopeaWindow = iframe.contentWindow;
            }
        });
    },

    getNodeMenuItems(node) {
        const items = [];
        
        // Detect if node has images
        // node.imgs is common for PreviewImage/SaveImage
        // node.widgets containing "image" is common for LoadImage
        if (node.imgs?.length > 0 || (node.widgets && node.widgets.some(w => w.name === "image"))) {
            items.push({
                content: "Open in Photopea",
                callback: async () => {
                    let imageUrl = null;
                    if (node.imgs?.length > 0) {
                        imageUrl = node.imgs[0].src;
                    } else {
                        const widget = node.widgets.find(w => w.name === "image");
                        if (widget?.value) {
                            imageUrl = `/view?filename=${encodeURIComponent(widget.value)}&type=input`;
                        }
                    }

                    if (imageUrl) {
                        // Activate tab
                        app.extensionManager.activateSidebarTab("photopea-sidebar-tab");
                        
                        // Wait a bit for iframe to be ready if it was just created?
                        // Actually, if it's already there, just send.
                        
                        try {
                            const response = await fetch(imageUrl);
                            const blob = await response.blob();
                            const buffer = await blob.arrayBuffer();
                            
                            // Send to Photopea
                            const photopeaIframe = document.querySelector("#photopea-sidebar-tab iframe");
                            if (photopeaIframe?.contentWindow) {
                                photopeaIframe.contentWindow.postMessage(buffer, "*");
                            }
                        } catch (err) {
                            console.error("Failed to send image to Photopea", err);
                        }
                    }
                }
            });
        }
        
        return items;
    }
});
