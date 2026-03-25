document.addEventListener("DOMContentLoaded", () => {
    const EXTENSIONES_PERMITIDAS = [".mp4", ".mov"];
    const MIMETYPES_PERMITIDOS = ["video/mp4", "video/quicktime"];
    const TAMANO_MAXIMO_BYTES = 256 * 1024 * 1024 * 1024;

    const botonSubir = document.getElementById("btn-subir-nuevo-video");
    const inputVideo = document.getElementById("input-video");
    const formulario = document.getElementById("form-subir-video");
    const feedback = document.getElementById("subida-feedback");

    if (!botonSubir || !inputVideo || !formulario || !feedback) {
        return;
    }

    botonSubir.addEventListener("click", () => {
        inputVideo.click();
    });

    inputVideo.addEventListener("change", async () => {
        if (!inputVideo.files || inputVideo.files.length === 0) {
            return;
        }

        const archivoVideo = inputVideo.files[0];

        feedback.classList.add("d-none");
        feedback.classList.remove("alert-danger", "alert-success");

        const resultadoValidacion = validarArchivoVideo(
            archivoVideo,
            EXTENSIONES_PERMITIDAS,
            MIMETYPES_PERMITIDOS,
            TAMANO_MAXIMO_BYTES
        );

        if (!resultadoValidacion.ok) {
            feedback.textContent = resultadoValidacion.error;
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger");
            inputVideo.value = "";
            return;
        }

        const formData = new FormData(formulario);

        try {
            botonSubir.disabled = true;
            botonSubir.textContent = "Subiendo...";

            const duracionSegundos = await obtenerDuracionSegundos(archivoVideo);
            formData.set("duracion_segundos", String(duracionSegundos));

            const response = await fetch("/usuario/api/cargar-video", {
                method: "POST",
                body: formData
            });

            const resultado = await response.json();

            if (!response.ok || !resultado.ok) {
                throw new Error(resultado.error || "No se pudo subir el video");
            }

            feedback.textContent = resultado.mensaje || "Video subido correctamente";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-success");

            setTimeout(() => {
                window.location.reload();
            }, 1200);
        } catch (error) {
            feedback.textContent = error.message || "Error interno al subir el video";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger");
        } finally {
            botonSubir.disabled = false;
            botonSubir.textContent = "Subir nuevo video";
            inputVideo.value = "";
        }
    });
});

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
