document.addEventListener("DOMContentLoaded", () => {
    const EXTENSIONES_PERMITIDAS = [".jpg", ".jpeg", ".png"];
    const MIMETYPES_PERMITIDOS = ["image/jpeg", "image/png"];
    const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024; // 50 MB

    const botonSubir = document.getElementById("btn-subir-nueva-foto");
    const inputFoto = document.getElementById("input-foto");
    const formulario = document.getElementById("form-subir-foto");
    const feedback = document.getElementById("subida-feedback-foto");

    if (!botonSubir || !inputFoto || !formulario || !feedback) return;

    botonSubir.addEventListener("click", () => {
        inputFoto.click();
    });

    inputFoto.addEventListener("change", async () => {
        if (!inputFoto.files || inputFoto.files.length === 0) return;

        const archivoFoto = inputFoto.files[0];

        feedback.classList.add("d-none");
        feedback.classList.remove("alert-danger", "alert-success");

        const resultadoValidacion = validarArchivoFoto(
            archivoFoto,
            EXTENSIONES_PERMITIDAS,
            MIMETYPES_PERMITIDOS,
            TAMANO_MAXIMO_BYTES
        );

        if (!resultadoValidacion.ok) {
            feedback.textContent = resultadoValidacion.error;
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger", "text-white");
            inputFoto.value = "";
            return;
        }

        const formData = new FormData(formulario);

        try {
            botonSubir.disabled = true;
            botonSubir.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo...';

            const response = await fetch("/usuario/api/cargar-foto", {
                method: "POST",
                body: formData
            });

            const contentType = response.headers.get("content-type") || "";
            let resultado;
            if (contentType.includes("application/json")) {
                resultado = await response.json();
            } else {
                throw new Error("Respuesta inesperada del servidor.");
            }

            if (!response.ok || !resultado.ok) {
                throw new Error(resultado.error || "No se pudo subir la foto");
            }

            feedback.textContent = resultado.mensaje || "Foto subida correctamente";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-success", "text-white");

            setTimeout(() => {
                window.location.reload();
            }, 1200);

        } catch (error) {
            feedback.textContent = error.message || "Error interno al subir la foto";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger", "text-white");
        } finally {
            botonSubir.disabled = false;
            botonSubir.innerHTML = "Subir nueva foto";
            inputFoto.value = "";
        }
    });
});

// Función para validar el archivo de foto
function validarArchivoFoto(archivoFoto, extensionesPermitidas, mimeTypesPermitidos, tamanoMaximoBytes) {
    const nombre = (archivoFoto.name || "").toLowerCase();
    const extensionValida = extensionesPermitidas.some((extension) => nombre.endsWith(extension));
    const mimeType = (archivoFoto.type || "").toLowerCase();
    const mimeTypeValido = mimeType === "" || mimeTypesPermitidos.includes(mimeType);

    if (!extensionValida || !mimeTypeValido) {
        return {
            ok: false,
            error: "Solo se permiten fotos en formato .jpg, .jpeg y .png"
        };
    }

    if (archivoFoto.size > tamanoMaximoBytes) {
        return {
            ok: false,
            error: "El archivo supera el límite de 50 MB"
        };
    }

    return { ok: true };
}
