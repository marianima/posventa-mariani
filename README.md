# Temporizador independiente de posventa

Este directorio contiene el temporizador para un repositorio **público y separado**,
visibilidad autorizada por el propietario exclusivamente para estos archivos.
Su existencia local no acredita que esté instalado ni activo en GitHub.
No copiar el resto del CRM, su base, adjuntos ni credenciales SMTP.

## Preparación

1. Comprobar acceso y permisos de Actions. Usar solo runners estándar de Linux
   en el repositorio público, gratuitos según la tarifa consultada de GitHub.
   No usar runners grandes, crear artefactos ni habilitar gasto adicional.
   Volver a comprobar la tarifa si cambia el proveedor o la visibilidad.
2. Copiar solo el contenido de este directorio a la raíz del repositorio:
   `runner.mjs`, `test/runner.test.mjs`, `.github/workflows/posventa.yml` y este
   README. El repositorio debe usar una rama predeterminada con esos archivos.
3. Configurar la variable de Actions `POSTVENTA_PUBLIC_ORIGIN` con el origen
   público de producción comprobado por el flujo de deployment.
4. Guardar `POSTVENTA_SERVICE_TOKEN` en **Actions Secrets**, usando el mismo valor
   ya configurado en el CRM publicado. Nunca copiarlo a código, chat o capturas.
   No confundir un Secret de Replit con uno de GitHub: no se sincronizan solos.
5. Mantener `POSTVENTA_MODE=probe`. Incluso si falta la variable, se usa sonda.

## Comprobaciones antes de despachar

Ejecutar los tests sin red: `node --test test/runner.test.mjs`.
El workflow también los ejecuta antes de cada llamada.

Una ejecución manual correcta verifica Secrets y conectividad, no recurrencia.
El calendario es diario a las 13:45 UTC (10:45 de Argentina); GitHub puede
demorar ejecuciones. Verificar un run cuyo evento sea **schedule**, su horario,
su resultado y el registro correspondiente en el CRM, sin navegador abierto.
No reducir la frecuencia para simular esa prueba sin autorización.

El ejecutable no reintenta errores ni sigue redirecciones, y tampoco imprime
cuerpos de respuesta, claves o datos de clientes. Ante una respuesta perdida en despacho,
consultar el CRM antes de repetir.

## Activación posterior

Solo tras aprobar el proveedor/costo, completar la prueba real y verificar la
recurrencia: aplicar la aprobación del disparador en el CRM, revisar fecha de
inicio y destinatarios, y habilitar el despacho explícitamente en ambos lados.
El runner requiere `POSTVENTA_MODE=dispatch` y el CRM mantiene sus propios
controles. Un historial reciente se revisa como lote separado; no retroceder
la fecha de inicio para incorporarlo.

Para pausar el temporizador, deshabilitar el workflow en GitHub. Para mantener
comprobaciones sin despacho, volver a `POSTVENTA_MODE=probe`. Ninguna opción
borra respuestas ni autoriza reenviar invitaciones ya reclamadas.
