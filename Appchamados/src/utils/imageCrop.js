function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

export async function getCroppedImageFile(imageSrc, cropPixels, fileName = 'foto-perfil.jpg') {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const MAX_OUTPUT_SIZE = 512

  const cropWidth = Math.max(1, Math.round(cropPixels.width))
  const cropHeight = Math.max(1, Math.round(cropPixels.height))
  const scale = Math.min(1, MAX_OUTPUT_SIZE / Math.max(cropWidth, cropHeight))

  const width = Math.max(1, Math.round(cropWidth * scale))
  const height = Math.max(1, Math.round(cropHeight * scale))

  canvas.width = width
  canvas.height = height

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    width,
    height,
  )

  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85)
  })

  if (!blob) {
    throw new Error('Falha ao gerar imagem recortada.')
  }

  return new File([blob], fileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
}
