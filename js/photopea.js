console.log("Photopea Tab extension script loaded.");
import { app } from "../../scripts/app.js";

let photopeaWindow = null;
let persistentContainer = null;
let lastRequestingNodeId = null;
let lastExportKind = "image"; // "image", "layer", "mask"

app.registerExtension({
    name: "Comfy.PhotopeaTab",
    setup() {
        console.log("Photopea Tab extension: setup called");
        if (!app.extensionManager?.registerSidebarTab) {
            console.warn("Sidebar Tab API not available. This extension requires a newer version of ComfyUI.");
            return;
        }

        // Inject custom icon style
        const style = document.createElement("style");
        style.textContent = `
            .pi-photopea-logo {
                mask-image: url('/extensions/ComfyUI-Photopea-tab/photopea_logo.svg');
                -webkit-mask-image: url('/extensions/ComfyUI-Photopea-tab/photopea_logo.svg');
                mask-size: contain;
                -webkit-mask-size: contain;
                mask-repeat: no-repeat;
                -webkit-mask-repeat: no-repeat;
                mask-position: center;
                -webkit-mask-position: center;
                background-color: currentColor;
                width: 20px;
                height: 20px;
                display: inline-block;
                vertical-align: middle;
            }
            .pi-photopea-logo::before {
                content: "" !important;
            }
            .photopea-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 0 10px;
                background: #111;
                border-bottom: 1px solid #333;
                color: #ddd;
                font-family: sans-serif;
                font-size: 11px;
                height: 34px;
                box-sizing: border-box;
                flex-shrink: 0;
            }
            .photopea-toolbar-select {
                background: #222;
                border: 1px solid #444;
                color: #eee;
                padding: 2px;
                border-radius: 4px;
                outline: none;
                font-size: 11px;
                cursor: pointer;
            }
            .photopea-toolbar-btn {
                background: #222;
                border: 1px solid #444;
                color: #eee;
                padding: 3px 8px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                transition: all 0.2s;
            }
            .photopea-toolbar-btn:hover {
                background: #333;
                border-color: #555;
            }
            .photopea-toolbar-btn.active {
                background: #3b82f6;
                border-color: #60a5fa;
                color: white;
            }
        `;
        document.head.appendChild(style);

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

        let adsHidden = false;
        let isMaximized = false;
        let wasMaximizedBeforeFS = false;
        let uiZoom = 1.0;
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

            // Add Toolbar
            const toolbar = document.createElement("div");
            toolbar.className = "photopea-toolbar";
            toolbar.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <i class="pi pi-photopea-logo" style="width:16px; height:16px;"></i>
                    <span style="font-weight:bold; opacity:0.9;">Photopea</span>
                </div>
                <div style="flex:1;"></div>
                <div style="display:flex; align-items:center; gap:2px;">
                    <button class="photopea-toolbar-btn" id="photopea-ui-zoom-out" title="Zoom Out (UI)">
                        <i class="pi pi-minus" style="font-size: 9px;"></i>
                    </button>
                    <button class="photopea-toolbar-btn" id="photopea-ui-zoom-100" style="font-size: 10px; padding: 3px 6px;" title="Reset Zoom">
                         100%
                    </button>
                    <button class="photopea-toolbar-btn" id="photopea-ui-zoom-in" title="Zoom In (UI)">
                        <i class="pi pi-plus" style="font-size: 9px;"></i>
                    </button>
                </div>
                <div style="width: 4px;"></div>
                <button class="photopea-toolbar-btn" id="photopea-ad-toggle" title="Hide Ads (+300px width)">
                    <i class="pi pi-eye-slash"></i>
                </button>
                <button class="photopea-toolbar-btn" id="photopea-maximize-toggle" title="Maximize View (Fill Screen)">
                    <i class="pi pi-window-maximize"></i>
                </button>
                <button class="photopea-toolbar-btn" id="photopea-fullscreen-btn" title="Browser Fullscreen">
                    <i class="pi pi-expand"></i>
                </button>
            `;

            const refreshZoomUI = () => {
                const btn = toolbar.querySelector("#photopea-ui-zoom-100");
                if (btn) btn.textContent = `${Math.round(uiZoom * 100)}%`;
            };

            toolbar.querySelector("#photopea-ui-zoom-in").onclick = () => { uiZoom += 0.05; refreshZoomUI(); };
            toolbar.querySelector("#photopea-ui-zoom-out").onclick = () => { uiZoom = Math.max(0.1, uiZoom - 0.05); refreshZoomUI(); };
            toolbar.querySelector("#photopea-ui-zoom-100").onclick = () => { uiZoom = 1.0; refreshZoomUI(); };
            refreshZoomUI(); // Initial value

            const adToggle = toolbar.querySelector("#photopea-ad-toggle");
            adToggle.onclick = () => {
                adsHidden = !adsHidden;
                adToggle.classList.toggle("active", adsHidden);
            };

            const maximizeToggle = toolbar.querySelector("#photopea-maximize-toggle");
            const updateUI = () => {
                const isFS = !!document.fullscreenElement;
                maximizeToggle.style.display = isFS ? "none" : "flex";
                maximizeToggle.classList.toggle("active", isMaximized);
                maximizeToggle.querySelector("i").className = isMaximized ? "pi pi-window-minimize" : "pi pi-window-maximize";
            };

            maximizeToggle.onclick = () => {
                isMaximized = !isMaximized;
                updateUI();
            };

            const fullscreenBtn = toolbar.querySelector("#photopea-fullscreen-btn");
            fullscreenBtn.onclick = () => {
                if (!document.fullscreenElement) {
                    wasMaximizedBeforeFS = isMaximized;
                    isMaximized = true; // Must be true for fullscreen container to fill
                    persistentContainer.requestFullscreen().catch(e => console.error(e));
                } else {
                    document.exitFullscreen();
                }
            };

            document.addEventListener("fullscreenchange", () => {
                if (!document.fullscreenElement) {
                    isMaximized = wasMaximizedBeforeFS;
                }
                updateUI();
            });

            persistentContainer.appendChild(toolbar);

            const iframe = document.createElement("iframe");
            iframe.id = "photopea-iframe";
            iframe.style.border = "none";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.flex = "none"; // Required for UI scaling to work properly
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

                    let prefix = "photopea_";
                    if (lastExportKind === "layer_fit") prefix = "photopea_fit_";
                    const filename = lastRequestingNodeId ? `${prefix}${lastRequestingNodeId}.png` : "photopea_export.png";
                    const formData = new FormData();
                    formData.append("image", new Blob([e.data]), filename);
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
                                lastRequestingNodeId = null;
                                lastExportKind = "image";
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
            icon: "pi pi-photopea-logo",
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
            if (isMaximized) {
                persistentContainer.style.visibility = "visible";
                persistentContainer.style.top = "0";
                persistentContainer.style.left = "0";
                persistentContainer.style.width = "100vw";
                persistentContainer.style.height = "100vh";
                persistentContainer.style.display = "flex";

                const iframe = document.getElementById("photopea-iframe");
                if (iframe) {
                    const extraWidth = adsHidden ? 300 : 0;
                    const w = window.innerWidth;
                    const h = window.innerHeight - 34; // Subtract toolbar
                    iframe.style.width = `${(w + extraWidth) / uiZoom}px`;
                    iframe.style.height = `${h / uiZoom}px`;
                    iframe.style.transform = `scale(${uiZoom})`;
                    iframe.style.transformOrigin = "top left";
                }
                requestAnimationFrame(syncPosition);
                return;
            }

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

                const iframe = document.getElementById("photopea-iframe");
                if (iframe) {
                    const extraWidth = adsHidden ? 300 : 0;
                    const w = rect.width;
                    const h = rect.height - 34;
                    iframe.style.width = `${(w + extraWidth * uiZoom) / uiZoom}px`;
                    iframe.style.height = `${h / uiZoom}px`;
                    iframe.style.transform = `scale(${uiZoom})`;
                    iframe.style.transformOrigin = "top left";
                }
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
                content: "Photopea - Open image",
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
            const sendExportScript = (nodeId, kind) => {
                lastRequestingNodeId = nodeId;
                lastExportKind = kind;
                const photopeaContainer = document.querySelector("#photopea-persistent-container");
                const photopeaIframe = photopeaContainer?.querySelector("iframe");
                if (photopeaIframe?.contentWindow) {
                    if (kind === "image") {
                        console.log("PhotopeaTab: Requesting full document save...");
                        photopeaIframe.contentWindow.postMessage("app.activeDocument.saveToOE('png')", "*");
                    } else if (kind === "layer") {
                        console.log(`PhotopeaTab: Requesting layer save...`);
                        const script = `
                            (function() {
                                var doc = app.activeDocument;
                                var active = doc.activeLayer;
                                if (!active) return;
                                var states = [];
                                function collect(cont) {
                                    for (var i = 0; i < cont.layers.length; i++) {
                                        states.push({l: cont.layers[i], v: cont.layers[i].visible});
                                        if (cont.layers[i].layers) collect(cont.layers[i]);
                                    }
                                }
                                collect(doc);
                                for (var i = 0; i < states.length; i++) states[i].l.visible = false;
                                var curr = active;
                                while (curr && curr !== doc) {
                                    curr.visible = true;
                                    curr = curr.parent;
                                }
                                doc.saveToOE("png");
                                for (var i = 0; i < states.length; i++) states[i].l.visible = states[i].v;
                            })();
                        `;
                        photopeaIframe.contentWindow.postMessage(script, "*");
                    } else if (kind === "layer_fit") {
                        console.log(`PhotopeaTab: Requesting layer save (fit size)...`);
                        const script = `
                            (function() {
                                var doc = app.activeDocument;
                                var active = doc.activeLayer;
                                if (!active) return;
                                
                                // Create a temporary document of the same size
                                var newDoc = app.documents.add(doc.width, doc.height, doc.resolution, "Fit Export", 2, 1);
                                
                                // Select original doc to duplicate from
                                app.activeDocument = doc;
                                active.duplicate(newDoc);
                                
                                // Switch to new doc, trim and save
                                app.activeDocument = newDoc;
                                try { newDoc.trim(0); } catch(e) {}
                                newDoc.saveToOE("png");
                                newDoc.close(2);
                            })();
                        `;
                        photopeaIframe.contentWindow.postMessage(script, "*");
                    }
                }
            };

            items.push({
                content: "Photopea - Import image",
                callback: () => sendExportScript(node.id, "image")
            });

            items.push({
                content: "Photopea - Import layer",
                callback: () => sendExportScript(node.id, "layer")
            });

            items.push({
                content: "Photopea - Import layer: fit size",
                callback: () => sendExportScript(node.id, "layer_fit")
            });
        }

        return items;
    }
});
