console.log("Photopea Tab extension script loaded.");
import { app } from "../../scripts/app.js";

let photopeaWindow = null;
let persistentContainer = null;
let lastRequestingNodeId = null;

app.registerExtension({
    name: "Comfy.PhotopeaTab",
    setup() {
        console.log("Photopea Tab extension: setup called");
        if (!app.extensionManager?.registerSidebarTab) {
            console.warn("Sidebar Tab API not available. This extension requires a newer version of ComfyUI.");
            return;
        }

        const config = {
            "environment": {
                "theme": 2, // Dark theme
                "lang": "en", // Force English
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
            persistentContainer.style.overflow = "hidden";

            const iframe = document.createElement("iframe");
            iframe.style.flex = "1";
            iframe.style.border = "none";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.allow = "clipboard-read; clipboard-write; shift-ctrl-copy-paste";

            persistentContainer.appendChild(iframe);
            document.body.appendChild(persistentContainer);

            iframe.src = `https://www.photopea.com#${encodedConfig}`;
            photopeaWindow = iframe.contentWindow;
        };

        setupPersistentContainer();

        // Listen for messages from Photopea
        window.addEventListener("message", async (e) => {
            if (persistentContainer && e.source === photopeaWindow) {
                if (e.data instanceof ArrayBuffer) {
                    console.log("PhotopeaTab: Received ArrayBuffer from Photopea", e.data.byteLength);

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
                            console.log("PhotopeaTab: Uploaded successfully:", result.name);

                            let nodesToUpdate = [];
                            if (lastRequestingNodeId) {
                                const node = app.graph.getNodeById(lastRequestingNodeId);
                                if (node) nodesToUpdate.push(node);
                                lastRequestingNodeId = null; // Reset
                            } else {
                                const selectedNodes = app.canvas.selected_nodes;
                                for (const id in selectedNodes) {
                                    nodesToUpdate.push(selectedNodes[id]);
                                }
                            }

                            let updatedCount = 0;
                            for (const node of nodesToUpdate) {
                                if (node.comfyClass === "LoadImage") {
                                    const widget = node.widgets.find(w => w.name === "image");
                                    if (widget) {
                                        widget.value = result.name;
                                        if (widget.callback) {
                                            widget.callback(widget.value);
                                        }
                                        node.onWidgetChanged?.("image", result.name);
                                        updatedCount++;
                                    }
                                }
                            }
                            app.graph.setDirtyCanvas(true, true);
                            console.log(`PhotopeaTab: Updated ${updatedCount} LoadImage nodes.`);
                        }
                    } catch (err) {
                        console.error("PhotopeaTab: Error uploading image:", err);
                    }
                } else if (typeof e.data === "string") {
                    console.log("PhotopeaTab: Received message from Photopea:", e.data);
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
        const hasImages = node.imgs?.length > 0 || (node.widgets && node.widgets.some(w => w.name === "image"));
        const isLoadImage = node.comfyClass === "LoadImage";

        if (hasImages) {
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
                        const tabBtn = document.querySelector(`.comfy-sidebar-tab-btn[data-id="photopea-sidebar-tab"]`) ||
                            document.querySelector(`.comfy-sidebar-tab-btn[title="Photopea"]`);
                        if (tabBtn) tabBtn.click();
                        else {
                            const sideBtn = document.querySelector(`button[data-tab-id="photopea-sidebar-tab"]`);
                            if (sideBtn) sideBtn.click();
                        }

                        try {
                            console.log("PhotopeaTab: Opening image in Photopea:", imageUrl);
                            const response = await fetch(imageUrl);
                            if (!response.ok) throw new Error("Failed to fetch image");
                            const blob = await response.blob();
                            const buffer = await blob.arrayBuffer();
                            const photopeaContainer = document.querySelector("#photopea-persistent-container");
                            const photopeaIframe = photopeaContainer?.querySelector("iframe");
                            if (photopeaIframe?.contentWindow) {
                                console.log("PhotopeaTab: Sending buffer to Photopea", buffer.byteLength);
                                photopeaIframe.contentWindow.postMessage(buffer, "*");
                            }
                        } catch (err) {
                            console.error("PhotopeaTab: Failed to send image to Photopea", err);
                        }
                    }
                }
            });
        }

        if (isLoadImage) {
            items.push({
                content: "Import from Photopea",
                callback: () => {
                    console.log("PhotopeaTab: Context menu Import clicked for node:", node.id);
                    lastRequestingNodeId = node.id;
                    const photopeaContainer = document.querySelector("#photopea-persistent-container");
                    const photopeaIframe = photopeaContainer?.querySelector("iframe");
                    if (photopeaIframe?.contentWindow) {
                        console.log("PhotopeaTab: Requesting save from Photopea...");
                        photopeaIframe.contentWindow.postMessage("app.activeDocument.saveToOE('png')", "*");
                    }
                }
            });
        }

        return items;
    }
});
