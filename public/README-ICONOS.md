# Instrucciones para añadir los iconos de la PWA

## Ubicación de los iconos

Los iconos deben estar en este directorio (`public/`) con estos nombres exactos:
- `pwa-192x192.png` (debe ser exactamente 192x192 píxeles)
- `pwa-512x512.png` (debe ser exactamente 512x512 píxeles)

## Pasos para añadir los iconos

1. **Redimensiona las imágenes** a los tamaños correctos:
   - Una imagen a 192x192 píxeles → guardarla como `pwa-192x192.png`
   - Otra imagen a 512x512 píxeles → guardarla como `pwa-512x512.png`

2. **Coloca los archivos** en el directorio `public/` (este mismo directorio)

3. **Verifica que los nombres sean exactos**:
   - `pwa-192x192.png` (con guiones, no guiones bajos)
   - `pwa-512x512.png` (con guiones, no guiones bajos)

4. **Haz commit y push**:
   ```bash
   git add public/pwa-*.png
   git commit -m "Add PWA icons"
   git push
   ```

5. **Espera a que el workflow se ejecute** y los iconos estarán disponibles en la app.

## Herramientas para redimensionar

- **Online**: https://www.iloveimg.com/resize-image
- **Mac**: Preview (abre la imagen → Tools → Adjust Size)
- **Windows**: Paint o cualquier editor de imágenes
- **Online específico para PWA**: https://realfavicongenerator.net/

## Nota importante

Los iconos deben ser:
- Formato PNG
- Tamaños exactos (192x192 y 512x512)
- Fondo transparente o sólido (recomendado)
- Buena calidad (sin pixelación)
