console.log("Photopea Tab extension script loaded.");
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PhotopeaTab",
    setup() {
        console.log("Photopea Tab extension: setup called");
        if (!app.extensionManager?.registerSidebarTab) {
            console.warn("Sidebar Tab API not available. This extension requires a newer version of ComfyUI.");
            return;
        }

        let photopeaWindow = null;
        let persistentContainer = null;

        const config = {
            "environment": {
                "theme": 2, // Dark theme
                "intro": false,
                "vmode": 0,
                "api": true // Enable API mode
            }
        };
        const encodedConfig = encodeURIComponent(JSON.stringify(config));

        const setupPersistentContainer = () => {
            if (persistentContainer) return;

            persistentContainer = document.createElement("div");
            persistentContainer.id = "photopea-persistent-container";
            persistentContainer.style.position = "fixed";
            persistentContainer.style.top = "0";
            persistentContainer.style.left = "-10000px";
            persistentContainer.style.visibility = "hidden";
            persistentContainer.style.display = "flex";
            persistentContainer.style.flexDirection = "column";
            persistentContainer.style.zIndex = "10001";
            persistentContainer.style.background = "#000";
            persistentContainer.style.pointerEvents = "auto";

            const toolbar = document.createElement("div");
            toolbar.style.display = "flex";
            toolbar.style.padding = "5px";
            toolbar.style.gap = "5px";
            toolbar.style.background = "#222";

            const importBtn = document.createElement("button");
            importBtn.innerText = "Import to Selected LoadImage";
            importBtn.style.flex = "1";
            importBtn.onclick = () => {
                if (photopeaWindow) {
                    photopeaWindow.postMessage("app.activeDocument.saveToOE('png')", "*");
                }
            };
            
            toolbar.appendChild(importBtn);
            persistentContainer.appendChild(toolbar);

            const iframe = document.createElement("iframe");
            iframe.style.flex = "1";
            iframe.style.border = "none";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.allow = "clipboard-read; clipboard-write; shift-ctrl-copy-paste";
            
            persistentContainer.appendChild(iframe);
            document.body.appendChild(persistentContainer);
            
            // Set src after appending to body
            iframe.src = `https://www.photopea.com#${encodedConfig}`;
            photopeaWindow = iframe.contentWindow;
            
            console.log("Photopea persistent container initialized at 100,100");
        };

        setupPersistentContainer();

        // Listen for messages from Photopea
        window.addEventListener("message", async (e) => {
            // Check both source and origin if needed, but source check is usually enough
            if (photopeaWindow && e.source === photopeaWindow) {
                if (e.data instanceof ArrayBuffer) {
                    // Export from Photopea received
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
                el.id = "photopea-tab-anchor";
                el.style.width = "100%";
                el.style.height = "100%";
            }
        });

        // Global tracking loop
        const syncPosition = () => {
            const anchor = document.getElementById("photopea-tab-anchor");
            if (!anchor || !persistentContainer) {
                if (persistentContainer) {
                    persistentContainer.style.visibility = "hidden";
                    persistentContainer.style.left = "-10000px";
                }
                requestAnimationFrame(syncPosition);
                return;
            }

            const rect = anchor.getBoundingClientRect();
            // Check if anchor is actually visible and has size
            if (rect.width > 5 && rect.height > 5) {
                persistentContainer.style.visibility = "visible";
                persistentContainer.style.top = `${rect.top}px`;
                persistentContainer.style.left = `${rect.left}px`;
                persistentContainer.style.width = `${rect.width}px`;
                persistentContainer.style.height = `${rect.height}px`;
                persistentContainer.style.display = "flex";
            } else {
                persistentContainer.style.visibility = "hidden";
                persistentContainer.style.left = "-10000px";
            }
            
            requestAnimationFrame(syncPosition);
        };

        syncPosition();
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
                        
                        try {
                            const response = await fetch(imageUrl);
                            const blob = await response.blob();
                            const buffer = await blob.arrayBuffer();
                            
                            // Corrected selector for persistent container
                            const photopeaContainer = document.querySelector("#photopea-persistent-container");
                            const photopeaIframe = photopeaContainer?.querySelector("iframe");
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
