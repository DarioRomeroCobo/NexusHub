const { BlobServiceClient } = require('@azure/storage-blob');

class AzureBlobStorage {
    constructor(connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    }

    async uploadBlob(containerName, blobName, fileBuffer, options = {}) {
        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);
            await containerClient.createIfNotExists();

            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            const uploadBlobResponse = await blockBlobClient.upload(fileBuffer, fileBuffer.length, options);

            return {
                success: true,
                blobName,
                containerName,
                uploadDate: new Date(),
                url: blockBlobClient.url
            };
        } catch (error) {
            console.error('Error al subir blob:', error);
            throw new Error(`Error subiendo archivo a Azure: ${error.message}`);
        }
    }

    getBlobUrl(containerName, blobName) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        return blockBlobClient.url;
    }

    async deleteBlob(containerName, blobName) {
        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.delete();

            return { success: true, message: `Blob ${blobName} eliminado` };
        } catch (error) {
            throw new Error(`Error eliminando archivo: ${error.message}`);
        }
    }

    async listBlobs(containerName, prefix = "") {
        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);
            const blobs = [];

            for await (const blob of containerClient.listBlobsFlat({ prefix })) {
                const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
                blobs.push({
                    name: blob.name,
                    url: blockBlobClient.url,
                    size: blob.properties.contentLength || 0,
                    lastModified: blob.properties.lastModified || null
                });
            }

            return blobs;
        } catch (error) {
            throw new Error(`Error listando blobs: ${error.message}`);
        }
    }
}

module.exports = AzureBlobStorage;