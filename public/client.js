document.addEventListener('DOMContentLoaded', () => {
    function sanitizarHTML(texto) {
        const temp = document.createElement('div');
        temp.textContent = texto;
        return temp.innerHTML;
    }

    const uploadForm = document.getElementById('uploadForm');
    const statusDiv = document.getElementById('status');
    const reparacionesGrid = document.getElementById('reparacionesGrid');
    const searchBox = document.getElementById('searchBox');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    let todasLasReparaciones = []; // Caché local de las reparaciones

    function formatUbicacion(ubicacion) {
        const coordRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
        if (ubicacion && coordRegex.test(ubicacion.trim())) {
            // Es una coordenada, crear enlace a Google Maps
            const sanitizedUbicacion = sanitizarHTML(ubicacion);
            return `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ubicacion)}" target="_blank" rel="noopener noreferrer">${sanitizedUbicacion} <i class="bi bi-geo-alt-fill"></i></a>`;
        }
        // No es una coordenada, o está vacío, devolver el texto sanitizado
        return sanitizarHTML(ubicacion);
    }

    // Cargar reparaciones iniciales
    cargarReparaciones();

    const btnGeolocalizar = document.getElementById('btnGeolocalizar');

    // --- MANEJO DE LA GEOLOCALIZACIÓN ---
    btnGeolocalizar.addEventListener('click', () => {
        if (navigator.geolocation) {
            btnGeolocalizar.disabled = true;
            btnGeolocalizar.innerHTML = 'Obteniendo...';
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                // Opcional: Usar una API de geocodificación inversa para obtener la dirección
                // Por simplicidad, aquí solo guardamos las coordenadas.
                document.getElementById('ubicacion').value = `${latitude}, ${longitude}`;
                btnGeolocalizar.disabled = false;
                btnGeolocalizar.innerHTML = 'Usar mi ubicación';
            }, (error) => {
                console.error("Error de geolocalización:", error);
                let errorMessage = `Error al obtener la ubicación: ${error.message}`;
                if (error.code === error.PERMISSION_DENIED) {
                    errorMessage = 'Permiso de geolocalización denegado. Por favor, habilita los servicios de ubicación para tu navegador en la configuración de tu sistema y navegador.';
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    errorMessage = 'Información de ubicación no disponible.';
                } else if (error.code === error.TIMEOUT) {
                    errorMessage = 'La solicitud para obtener la ubicación ha caducado.';
                }
                alert(errorMessage);
                btnGeolocalizar.disabled = false;
                btnGeolocalizar.innerHTML = 'Usar mi ubicación';
            });
        } else {
            alert('La geolocalización no es soportada por este navegador.');
        }
    });

    // --- MANEJO DEL FORMULARIO DE SUBIDA ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('descripcion', document.getElementById('descripcion').value);
        formData.append('ubicacion', document.getElementById('ubicacion').value);
        formData.append('fotoAntes', document.getElementById('fotoAntes').files[0]);
        formData.append('fotoDespues', document.getElementById('fotoDespues').files[0]);

        statusDiv.innerHTML = `<div class="alert alert-info">Subiendo...</div>`;
        uploadForm.querySelector('button[type="submit"]').disabled = true;

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                statusDiv.innerHTML = `<div class="alert alert-success">Reparación guardada con éxito.</div>`;
                uploadForm.reset();
                cargarReparaciones(); // Recargar la lista desde el servidor
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Error al guardar la reparación.');
            }
        } catch (error) {
            statusDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        } finally {
            uploadForm.querySelector('button').disabled = false;
            setTimeout(() => statusDiv.innerHTML = '', 4000);
        }
    });

    // --- LÓGICA DE CARGA Y FILTRADO DEL HISTORIAL ---
    async function cargarReparaciones() {
        try {
            const response = await fetch('/reparaciones');
            if (!response.ok) throw new Error('No se pudo conectar al servidor.');
            
            todasLasReparaciones = await response.json();
            // Ordenar de más reciente a más antiguo por defecto
            todasLasReparaciones.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            renderizarReparaciones();
        } catch (error) {
            reparacionesGrid.innerHTML = `<p class="text-center text-danger">${error.message}</p>`;
        }
    }

    function renderizarReparaciones() {
        const textoBusqueda = searchBox.value.toLowerCase();
        const fechaDesde = dateFrom.value ? new Date(dateFrom.value) : null;
        const fechaHasta = dateTo.value ? new Date(dateTo.value) : null;

        // Ajustar la hora de las fechas para incluir el día completo
        if (fechaDesde) fechaDesde.setHours(0, 0, 0, 0);
        if (fechaHasta) fechaHasta.setHours(23, 59, 59, 999);

        const reparacionesFiltradas = todasLasReparaciones.filter(rep => {
            const fechaReparacion = new Date(rep.timestamp);
            const descripcion = rep.descripcion.toLowerCase();

            const coincideBusqueda = descripcion.includes(textoBusqueda);
            const coincideFechaDesde = !fechaDesde || fechaReparacion >= fechaDesde;
            const coincideFechaHasta = !fechaHasta || fechaReparacion <= fechaHasta;

            return coincideBusqueda && coincideFechaDesde && coincideFechaHasta;
        });

        reparacionesGrid.innerHTML = ''; // Limpiar la vista

        if (reparacionesFiltradas.length === 0) {
            reparacionesGrid.innerHTML = '<p class="text-center text-muted">No se encontraron reparaciones que coincidan con los filtros.</p>';
            return;
        }

        reparacionesFiltradas.forEach(rep => {
            const col = document.createElement('div');
            col.className = 'col-md-6 col-lg-4';
            // Cada tarjeta ahora tiene un ID único para inicializar su propia galería
            const galleryId = `gallery-${rep.id}`;
            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <div class="card-header">
                        <small class="text-muted">${new Date(rep.timestamp).toLocaleString()}</small>
                    </div>
                    <div class="card-body">
                        <p class="card-text">${sanitizarHTML(rep.descripcion)}</p>
                        <p class="card-text"><small class="text-muted">Ubicación: ${formatUbicacion(rep.ubicacion)}</small></p>
                    </div>
                    <!-- Contenedor de la galería para lightgallery -->
                    <div class="row g-0" id="${galleryId}">
                        <a href="/uploads/${rep.fotoAntes}" class="col-6" data-sub-html="<h4>ANTES</h4><p>${sanitizarHTML(rep.descripcion)}</p>">
                            <img src="/uploads/${rep.fotoAntes}" class="card-img-top rounded-0" alt="Foto Antes" style="cursor: zoom-in;">
                            <div class="text-center small bg-light py-1">ANTES</div>
                        </a>
                        <a href="/uploads/${rep.fotoDespues}" class="col-6" data-sub-html="<h4>DESPUÉS</h4><p>${sanitizarHTML(rep.descripcion)}</p>">
                            <img src="/uploads/${rep.fotoDespues}" class="card-img-top rounded-0" alt="Foto Después" style="cursor: zoom-in;">
                            <div class="text-center small bg-light py-1">DESPUÉS</div>
                        </a>
                    </div>
                    <div class="card-footer text-end">
                        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${rep.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM4.5 3.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5"/></svg>
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
            reparacionesGrid.appendChild(col);

            // Inicializar lightgallery en el nuevo elemento
            lightGallery(document.getElementById(galleryId), {
                plugins: [lgZoom],
                selector: 'a',
                download: false, // Opcional: deshabilita el botón de descarga de la galería
                speed: 500
            });
        });
    }

    const downloadBtn = document.getElementById('downloadBtn');

    // --- MANEJO DE LA DESCARGA CSV ---
    downloadBtn.addEventListener('click', () => {
        window.location.href = '/download-csv';
    });

    // --- MANEJO DE LA ELIMINACIÓN DE REPARACIONES ---
    let isConfirming = false; // Bandera para evitar doble confirmación

    reparacionesGrid.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete');
        if (deleteButton && !isConfirming) {
            isConfirming = true; // Activar la bandera
            const reparacionId = deleteButton.dataset.id;

            if (confirm('¿Estás seguro de que quieres eliminar esta reparación? Esta acción es irreversible y borrará las fotos asociadas.')) {
                try {
                    const response = await fetch(`/reparaciones/${reparacionId}`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        statusDiv.innerHTML = `<div class="alert alert-success">Reparación eliminada con éxito.</div>`;
                        cargarReparaciones(); // Recargar la lista para reflejar el cambio
                    } else {
                        let errorMessage = 'Error desconocido al eliminar la reparación.';
                        try {
                            const errorData = await response.json();
                            errorMessage = errorData.message || errorMessage;
                        } catch (jsonError) {
                            // Si falla el parseo a JSON, significa que la respuesta no era JSON (ej. HTML)
                            errorMessage = `Error del servidor: ${response.status} ${response.statusText}. Respuesta inesperada.`;
                            console.error('Error al procesar la respuesta del servidor:', jsonError, response);
                        }
                        throw new Error(errorMessage);
                    }
                } catch (error) {
                    statusDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
                } finally {
                    isConfirming = false; // Desactivar la bandera
                    setTimeout(() => statusDiv.innerHTML = '', 4000);
                }
            } else {
                isConfirming = false; // Desactivar la bandera si el usuario cancela
            }
        }
    });

    // Añadir listeners a los filtros para que se actualice la vista en tiempo real
    searchBox.addEventListener('input', renderizarReparaciones);
    dateFrom.addEventListener('change', renderizarReparaciones);
    dateTo.addEventListener('change', renderizarReparaciones);
});