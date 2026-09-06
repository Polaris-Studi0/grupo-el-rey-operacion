# Conocimiento por sede

Estos archivos son plantillas versionadas para preparar y revisar información antes de cargarla al panel **WhatsApp e IA → Conocimiento**.

- Un dato no confirmado debe permanecer vacío; la IA no debe completarlo por inferencia.
- `global.json` contiene políticas aplicables a todas las sedes.
- Cada archivo de `branches/` contiene únicamente información propia de esa sede.
- El inventario y los precios no viven aquí: se administran en la tabla `branch_inventory` desde el panel.
- Actualiza `last_reviewed_at` con fecha ISO después de que una persona responsable valide el contenido.

Los archivos no se cargan automáticamente todavía. La importación masiva será un flujo independiente para poder validar cada cambio antes de publicarlo.
