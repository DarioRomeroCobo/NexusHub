document.addEventListener("DOMContentLoaded", () => {
    const EXTENSIONES_PERMITIDAS = [".mp4", ".mov"];
    const MIMETYPES_PERMITIDOS = ["video/mp4", "video/quicktime"];
    const TAMANO_MAXIMO_BYTES = 256 * 1024 * 1024 * 1024;


    //Referencias a elementos del DOM
    const botonSubir = document.getElementById("btn-subir-nuevo-video");
    const inputVideo = document.getElementById("input-video");
    const formulario = document.getElementById("form-subir-video");
    const feedback = document.getElementById("subida-feedback");

    // Si falta algún elemento, se detiene la ejecución
    if (!botonSubir || !inputVideo || !formulario || !feedback) {
        return;
    }

    //Se abre el selector de archivos al hacer click en el botón
    botonSubir.addEventListener("click", () => {
        inputVideo.click();
    });

    //Cuando el usuario selecciona un archivo
    inputVideo.addEventListener("change", async () => {
        // Si no hay archivo seleccionado, salir
        if (!inputVideo.files || inputVideo.files.length === 0) {
            return;
        }

        const archivoVideo = inputVideo.files[0];


        feedback.classList.add("d-none");
        feedback.classList.remove("alert-danger", "alert-success");

        //Validación del archivo
        const resultadoValidacion = validarArchivoVideo(
            archivoVideo,
            EXTENSIONES_PERMITIDAS,
            MIMETYPES_PERMITIDOS,
            TAMANO_MAXIMO_BYTES
        );

        //Si validación falla, mostrar error y cancelar
        if (!resultadoValidacion.ok) {
            document.getElementById("feedback-message").textContent = resultadoValidacion.error;
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger");
            inputVideo.value = "";
            return;
        }

        //Crear FormData para enviar al backend
        const formData = new FormData(formulario);

        try {
            //Se deshabilita el botón para evitar múltiples envíos
            botonSubir.disabled = true;
            botonSubir.textContent = "Subiendo...";

            const duracionSegundos = await obtenerDuracionSegundos(archivoVideo);
            formData.set("duracion_segundos", String(duracionSegundos));

            const response = await fetch("/usuario/api/cargar-video", {
                method: "POST",
                body: formData
            });

            const contentType = response.headers.get("content-type") || "";
            let resultado;
            if (contentType.includes("application/json")) {
                resultado = await response.json();
            } else {
                await response.text();
                throw new Error(
                    response.status === 401
                        ? "Tu sesion ha expirado. Inicia sesion de nuevo."
                        : `Respuesta inesperada del servidor (HTTP ${response.status}).`
                );
            }

            // Si hay error en el backend, lanzar excepción
            if (!response.ok || !resultado.ok) {
                throw new Error(resultado.error || "No se pudo subir el video");
            }

            document.getElementById("feedback-message").textContent = resultado.mensaje || "Video subido correctamente";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-success");

            //recargar la página tras subir el vídeo
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        } catch (error) {
            document.getElementById("feedback-message").textContent = error.message || "Error interno al subir el video";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger");
        } finally {
            botonSubir.disabled = false;
            botonSubir.textContent = "Subir nuevo video";
            inputVideo.value = "";
        }
    });

});

//Función para validar el archivo de vídeo
function validarArchivoVideo(archivoVideo, extensionesPermitidas, mimeTypesPermitidos, tamanoMaximoBytes) {
    const nombre = (archivoVideo.name || "").toLowerCase();
    const extensionValida = extensionesPermitidas.some((extension) => nombre.endsWith(extension));
    const mimeType = (archivoVideo.type || "").toLowerCase();
    const mimeTypeValido = mimeType === "" || mimeTypesPermitidos.includes(mimeType);

    if (!extensionValida || !mimeTypeValido) {
        return {
            ok: false,
            error: "Solo se permiten videos en formato .mp4 y .mov"
        };
    }

    if (archivoVideo.size > tamanoMaximoBytes) {
        return {
            ok: false,
            error: "El archivo supera el limite de 256 GB"
        };
    }

    return { ok: true };
}

//Funcion para obtener la duración vídeo en segundos
function obtenerDuracionSegundos(archivoVideo) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(archivoVideo);

        video.preload = "metadata";
        video.src = objectUrl;

        video.onloadedmetadata = () => {
            const duracion = Math.max(0, Math.round(video.duration || 0));
            URL.revokeObjectURL(objectUrl);
            resolve(duracion);
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("No se pudo leer la duración del video"));
        };
    });
}
