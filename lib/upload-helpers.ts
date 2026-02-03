export async function uploadFile(file: File): Promise<{ url: string; filename: string } | null> {
  try {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error("Upload failed")
    }

    const data = await response.json()
    return { url: data.url, filename: data.filename }
  } catch (error) {
    console.error("Error uploading file:", error)
    return null
  }
}
