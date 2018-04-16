/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */
// import 
const macro = vtk.macro;
const HttpDataAccessHelper = vtk.IO.Core.DataAccessHelper.vtkHttpDataAccessHelper;
const vtkFullScreenRenderWindow = vtk.Rendering.Misc.vtkFullScreenRenderWindow;
const vtkURLExtract = vtk.Common.Core.vtkURLExtract;

const Light = vtk.Rendering.Core.vtkLight;

const vtkOBJReader = vtk.IO.Misc.vtkOBJReader;
const vtkMTLReader = vtk.IO.Misc.vtkMTLReader;
const vtkMapper = vtk.Rendering.Core.vtkMapper;
const vtkActor = vtk.Rendering.Core.vtkActor;

const iOS = /iPad|iPhone|iPod/.test(window.navigator.platform);
let autoInit = true;

const renders = [0, 0, 0, 0];

// Update the light intensity value for the top two rendering window
function updateIsoValue(value) {
    renders.map((fullScreenRenderer, idx) => {
        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();
        // Only update the first two rendering windoe
        if (idx <= 1) {
            renderer.getLights()[0].setIntensity(parseFloat(value));
        }
        // Update rendering
        renderWindow.render();
    });
}

// Turn on the light for the bottom two rendering window
function clickLight() {
    renders.map((fullScreenRenderer, idx) => {
        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();
        // Only update the bottom two rendering windows
        if (idx >= 2) {
            renderer.getLights()[0].setIntensity(0.5);
        }
        // Update rendering
        renderWindow.render();
    });
}

// Turn on the light for the bottom two rendering window
function clickDark() {
    renders.map((fullScreenRenderer, idx) => {
        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();
        // Only update the bottom two rendering windows
        if (idx >= 2) {
            renderer.getLights()[0].setIntensity(1);
        }
        // Update rendering
        renderWindow.render();
    });
}

// Mobile compatibility
if (iOS) {
    document.querySelector('body').classList.add('is-ios-device');
}

// Overwrite preventDefault function
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// clear the container DOM element
function emptyContainer(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

// Upzip and load object related files
function loadZipContent(zipContent, renderWindow, renderer, property) {
    const fileContents = {
        obj: {},
        mtl: {},
        img: {}
    };
    const zip = new JSZip();
    // Load zip file
    zip.loadAsync(zipContent).then(() => {
        let workLoad = 0;

        function done() {
            if (workLoad !== 0) {
                return;
            }
            // Attach images to MTLs
            Object.keys(fileContents.mtl).forEach((mtlFilePath) => {
                const mtlReader = fileContents.mtl[mtlFilePath];
                const basePath = mtlFilePath
                    .split('/')
                    .filter((v, i, a) => i < a.length - 1)
                    .join('/');
                mtlReader.listImages().forEach((relPath) => {
                    const key = `${basePath}/${relPath}`;
                    const imgSRC = fileContents.img[key];
                    if (imgSRC) {
                        mtlReader.setImageSrc(relPath, imgSRC);
                    }
                });
            });

            // Create pipeline from obj
            Object.keys(fileContents.obj).forEach((objFilePath) => {
                const mtlFilePath = objFilePath.replace(/\.obj$/, '.mtl');
                const objReader = fileContents.obj[objFilePath];
                const mtlReader = fileContents.mtl[mtlFilePath];

                const size = objReader.getNumberOfOutputPorts();
                for (let i = 0; i < size; i++) {
                    // Setup for reading the object
                    const source = objReader.getOutputData(i);
                    const mapper = vtkMapper.newInstance();
                    const actor = vtkActor.newInstance();
                    const name = source.get('name').name;
                    // console.log(`property: ${property}`)
                    actor.getProperty().setRepresentation(property);
                    actor.setMapper(mapper);
                    mapper.setInputData(source);
                    renderer.addActor(actor);
                    // Map the material if there is one
                    if (mtlReader && name) {
                        mtlReader.applyMaterialToActor(name, actor);
                    }
                }
            });
            // Setup camera
            const cam = renderer.getActiveCamera();

            renderer.getActiveCamera().setPosition(-10, 10, 10)

            // Rendering update
            renderWindow.render();

            setTimeout(renderWindow.render, 500);
        }

        // Iteratively handle objects
        zip.forEach((relativePath, zipEntry) => {
            if (relativePath.match(/\.obj$/i)) {
                workLoad++;
                zipEntry.async('string').then((txt) => {
                    const reader = vtkOBJReader.newInstance({
                        splitMode: 'usemtl'
                    });
                    reader.parseAsText(txt);
                    fileContents.obj[relativePath] = reader;
                    workLoad--;
                    done();
                });
            }

            // Do not load textures when property = 1 or 2
            if (relativePath.match(/\.mtl$/i) && property > 2) {
                workLoad++;
                zipEntry.async('string').then((txt) => {
                    const reader = vtkMTLReader.newInstance();
                    reader.parseAsText(txt);
                    debugger;
                    fileContents.mtl[relativePath] = reader;
                    workLoad--;
                    done();
                });
            }
            // Also support jpg material mapping
            if (relativePath.match(/\.jpg$/i) || relativePath.match(/\.png$/i)) {
                workLoad++;
                zipEntry.async('base64').then((txt) => {
                    const ext = relativePath.slice(-3).toLowerCase();
                    fileContents.img[relativePath] = `data:image/${ext};base64,${txt}`;
                    workLoad--;
                    done();
                });
            }
        });
    });
}

// Base function for loading an object and then render to the rendering windows
function load(container, options, property) {
    autoInit = false;
    // clear container to avoid errors
    emptyContainer(container);

    // Setup rendering window property
    const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        background: [0, 0, 0],
        rootContainer: container,
        containerStyle: {
            height: '100%',
            width: '100%',
            position: 'relative'
        },
    });

    renders[property - 1] = fullScreenRenderer;

    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();

    //const controlPanel = $(".controlPanel");
    //fullScreenRenderer.addController(controlPanel.html());

    window.renderWindow = renderWindow;

    // Parse the uploaded file
    if (options.file) {
        // OBJ file received
        if (options.ext === 'obj') {
            const reader = new FileReader();
            // File loading process
            reader.onload = function onLoad(e) {
                const objReader = vtkOBJReader.newInstance();
                objReader.parseAsText(reader.result);
                // get ready to map the object to all output port, i.e. 
                const nbOutputs = objReader.getNumberOfOutputPorts();
                for (let idx = 0; idx < nbOutputs; idx++) {
                    // Read source, create mapper, actor
                    const source = objReader.getOutputData(idx);
                    const mapper = vtkMapper.newInstance();
                    const actor = vtkActor.newInstance();
                    actor.getProperty().setRepresentation(property);
                    actor.setMapper(mapper);
                    mapper.setInputData(source);
                    // Add to the rendering window
                    renderer.addActor(actor);
                }
                
                // This could be optimized by the loaded object size
                renderer.getActiveCamera().setPosition(-10, 10, 10);
                renderWindow.render();

            };
            reader.readAsText(options.file);
        } else {
            // handling zip file
            loadZipContent(options.file, renderWindow, renderer, property);
        }

    } else if (options.fileURL) {
        // Also accept file url, but will show a progress bar when loading the source from other origin
        const progressContainer = document.createElement('div');
        progressContainer.setAttribute('class', 'progress');

        container.appendChild(progressContainer);
        // this need to be clear to give the space to the rendering windows
        // see emptyContainers
        const progressCallback = (progressEvent) => {
            if (progressEvent.lengthComputable) {
                const percent = Math.floor(
                    100 * progressEvent.loaded / progressEvent.total
                );
                progressContainer.innerHTML = `Loading ${percent}%`;
            } else {
                progressContainer.innerHTML = macro.formatBytesToProperUnit(
                    progressEvent.loaded
                );
            }
        };

        HttpDataAccessHelper.fetchBinary(options.fileURL, {
            progressCallback,
        }).then((content) => {
            container.removeChild(progressContainer);
            loadZipContent(content, renderWindow, renderer);
        });
    }

    $('.light-btn-container').show();
    $('.controlPanel').show();
}

// Global initialization for the file loader, call this function
// when the page is loaded
function initLocalFileLoader(container) {
    const exampleContainer = document.querySelector('.content1');
    const rootBody = document.querySelector('body');
    const myContainer = container || exampleContainer || rootBody;
    const fileInput = document.querySelector('.input');

    // Handle accepted file, and render the obj to 4 windows
    function handleFile(e) {
        preventDefaults(e);
        const dataTransfer = e.dataTransfer;
        const files = e.target.files || dataTransfer.files;
        if (files.length === 1) {
            // myContainer.removeChild(fileContainer);
            const ext = files[0].name.split('.').slice(-1)[0];
            console.log(ext);

            load(myContainer, {
                file: files[0],
                ext
            }, 1); // Wireframe(No shading or texture)
            load(document.querySelector('.content2'), {
                file: files[0],
                ext
            }, 2); // Sureface(No shading or texture)
            load(document.querySelector('.content3'), {
                file: files[0],
                ext
            }, 3); // SUreface with texture map(No shading)
            load(document.querySelector('.content4'), {
                file: files[0],
                ext
            }, 4); // SUreface with texture map and Phong shading
        }
    }

    fileInput.addEventListener('change', handleFile);
}

// Look at URL an see if we should load a file
// ?fileURL=https://data.kitware.com/api/v1/item/59cdbb588d777f31ac63de08/download
const userParams = vtkURLExtract.extractURLParameters();

// Load the first rendering window
if (userParams.url || userParams.fileURL) {
    const exampleContainer = document.querySelector('.content1');
    const rootBody = document.querySelector('body');
    const myContainer = exampleContainer || rootBody;
    if (myContainer) {
        myContainer.classList.add('fullScreen');
        rootBody.style.margin = '0';
        rootBody.style.padding = '0';
    }
    load(myContainer, userParams);
}

// Auto setup if no method get called within 100ms
setTimeout(() => {
    if (autoInit) {
        initLocalFileLoader();
    }
}, 100);