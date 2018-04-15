/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */


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

const renders = [0,0,0,0];

function updateIsoValue(value) {
  renders.map((fullScreenRenderer, idx) => {
  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();
  console.log(renderer.getLights()[0].getIntensity());
  console.log(value);
  if (idx <= 1) {
      renderer.getLights()[0].setIntensity(parseFloat(value));
  }

  renderWindow.render();
  });
}

function clickLight() {
  renders.map((fullScreenRenderer, idx) => {
    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();

    if (idx >= 2) {
      renderer.getLights()[0].setIntensity(0.5);
    }

    renderWindow.render();
  });  
}

function clickDark() {
  renders.map((fullScreenRenderer, idx) => {
    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();

    if (idx >= 2) {
      renderer.getLights()[0].setIntensity(1);
    }

    renderWindow.render();
  });  
}



if (iOS) {
  document.querySelector('body').classList.add('is-ios-device');
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function emptyContainer(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function loadZipContent(zipContent, renderWindow, renderer, property) {
  const fileContents = { obj: {}, mtl: {}, img: {} };
  const zip = new JSZip();
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
          const source = objReader.getOutputData(i);
          const mapper = vtkMapper.newInstance();
          const actor = vtkActor.newInstance();
          const name = source.get('name').name;
          console.log(`property: ${property}`)
          actor.getProperty().setRepresentation(property);
          actor.setMapper(mapper);
          mapper.setInputData(source);
          renderer.addActor(actor);

          if (mtlReader && name) {
            mtlReader.applyMaterialToActor(name, actor);
          }
        }
      });
      const cam = renderer.getActiveCamera();

      renderer.getActiveCamera().setPosition(-10,10,10)
      renderWindow.render();

      setTimeout(renderWindow.render, 500);
    }

    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.match(/\.obj$/i)) {
        workLoad++;
        zipEntry.async('string').then((txt) => {
          const reader = vtkOBJReader.newInstance({ splitMode: 'usemtl' });
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


function load(container, options, property) {
  autoInit = false;
  emptyContainer(container);

  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    background: [0, 0, 0],
    rootContainer: container,
    containerStyle: { height: '100%', width: '100%', position: 'relative' },
  });

  renders[property-1] = fullScreenRenderer;

  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();

  //const controlPanel = $(".controlPanel");
  //fullScreenRenderer.addController(controlPanel.html());

  window.renderWindow = renderWindow;


  if (options.file) {
    if (options.ext === 'obj') {
      const reader = new FileReader();
      reader.onload = function onLoad(e) {
        const objReader = vtkOBJReader.newInstance();
        objReader.parseAsText(reader.result);
        const nbOutputs = objReader.getNumberOfOutputPorts();
        for (let idx = 0; idx < nbOutputs; idx++) {
          const source = objReader.getOutputData(idx);
          const mapper = vtkMapper.newInstance();
          const actor = vtkActor.newInstance();
          actor.getProperty().setRepresentation(property);
          actor.setMapper(mapper);
          mapper.setInputData(source);
          renderer.addActor(actor);
        }
  
        renderer.getActiveCamera().setPosition(-10, 10, 10);
        renderWindow.render();

      };
      reader.readAsText(options.file);
    } else {
      loadZipContent(options.file, renderWindow, renderer, property);
    }
    
  } else if (options.fileURL) {
    const progressContainer = document.createElement('div');
    progressContainer.setAttribute('class', 'progress');

    container.appendChild(progressContainer);

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

function initLocalFileLoader(container) {
  const exampleContainer = document.querySelector('.content1');
  const rootBody = document.querySelector('body');
  const myContainer = container || exampleContainer || rootBody;
  const fileInput = document.querySelector('.input');

  function handleFile(e) {
    preventDefaults(e);
    const dataTransfer = e.dataTransfer;
    const files = e.target.files || dataTransfer.files;
    if (files.length === 1) {
      // myContainer.removeChild(fileContainer);
      const ext = files[0].name.split('.').slice(-1)[0];
      console.log(ext);
      
      load(myContainer, { file: files[0], ext }, 1); // Wireframe(No shading or texture)
      load(document.querySelector('.content2'), { file: files[0], ext }, 2); // Sureface(No shading or texture)
      load(document.querySelector('.content3'), { file: files[0], ext }, 3); // SUreface with texture map(No shading)
      load(document.querySelector('.content4'), { file: files[0], ext }, 4); // SUreface with texture map and Phong shading
    }
  }
  
  fileInput.addEventListener('change', handleFile);
}

// Look at URL an see if we should load a file
// ?fileURL=https://data.kitware.com/api/v1/item/59cdbb588d777f31ac63de08/download
const userParams = vtkURLExtract.extractURLParameters();

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