# Voltalis

## Presentación

Esta integración lleva a Gladys los aparatos conectados a su caja **Voltalis**: radiadores con hilo piloto, calentador de agua, otras cargas. Inicia sesión con el correo y la contraseña de su cuenta **MyVoltalis**, como hace la app.

- Un dispositivo de Gladys por **aparato**: modo (apagado, manual, programación), preajuste (antihielo, eco, confort), consigna cuando el aparato la admite, y un índice de energía para el panel de energía de Gladys.
- Un dispositivo para la **vivienda**: potencia actual e índice de energía.
- Disparadores de escena (cambia el modo de un aparato, un aparato entra en avería o se recupera) y acciones de escena (modo manual durante un tiempo, volver a la programación, programas y ajustes rápidos, leer ahora).
- Tres widgets de panel: los aparatos, con los botones «Volver al programa» y «Antihielo», la energía de hoy y de las últimas 24 horas, y la conexión.

**Transporte: nube.** Gladys nunca habla directamente con su caja: lee y escribe la nube de Voltalis, que transmite los cambios. Un cambio hecho en Gladys se muestra al instante y se confirma unos segundos después; un cambio hecho en la app MyVoltalis o por un programa llega a Gladys en la siguiente lectura. Sus datos salen de casa (ya lo hacen con la caja Voltalis).

Sin relación con Voltalis. El servicio utilizado es el de la app MyVoltalis; Voltalis **no lo documenta** y puede cambiarlo sin previo aviso. Aún no probada con una caja Voltalis real: cuéntenos qué funciona y qué no.

![Ilustración generada de los tres widgets: los aparatos Voltalis (modo, programación o manual, averías, Volver al programa / Antihielo), la energía de hoy, de ayer y de las últimas 24 horas, y la conexión a Voltalis — no es una captura de pantalla](https://raw.githubusercontent.com/William-De71/gladys-voltalis/main/docs/assets/widgets.es.png)

## Requisitos previos

- Gladys Assistant **5.3.0** o posterior.
- Una **caja Voltalis** instalada en casa (Voltalis solo equipa viviendas en Francia).
- Una **cuenta MyVoltalis**: compruebe que puede iniciar sesión en la app o en myvoltalis.com con su correo y su contraseña. Voltalis no ofrece un acceso separado para terceros: la integración usa la contraseña de su cuenta.

## Configuración

En Gladys, abra **Integraciones → Voltalis**:

| Campo                                    | Descripción                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Correo electrónico                       | El correo de su cuenta MyVoltalis.                                                 |
| Contraseña                               | Su contraseña: solo se envía a Voltalis, nunca se vuelve a mostrar ni se registra. |
| Intervalo de lectura                     | Cada 1, 2, 5 o 10 minutos (2 por defecto). Una petición lee todos los aparatos.    |
| Idioma de los textos de los dispositivos | Nombres de las funciones y mensajes del botón; automático por defecto.             |

Pulse **Probar la conexión**: la integración lee sus aparatos y los lista con su tipo y sus funciones. Después abra la pestaña **Descubrir** y añada los aparatos que quiera, y el dispositivo «Vivienda Voltalis»: nada se crea sin usted. Con varias viviendas en la cuenta, solo se lee la vivienda por defecto de MyVoltalis.

## Uso

### Dispositivos

Cada aparato ofrece estas funciones, según lo que MyVoltalis le ofrezca:

| Función   | Tipo de Gladys                                   | Notas                                                                                                                                   |
| --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Modo      | Modo de termostato: apagado, calefacción, auto   | Apagado: una parada manual. Calefacción: un ajuste manual (se mantiene lo que hace el aparato). Auto: el aparato sigue su programación. |
| Preajuste | Preajuste de termostato: antihielo, eco, confort | Solo radiadores. Elegir uno crea un ajuste manual hasta nuevo aviso.                                                                    |
| Consigna  | Consigna de termostato, de 7 a 30 °C por 0,5 °C  | Solo cuando MyVoltalis ofrece el modo «temperatura». Cambiarla crea un ajuste manual en modo temperatura.                               |
| Energía   | Índice de energía (kWh)                          | Contado por la integración a partir de las horas que mide Voltalis; alimenta las páginas de consumo y coste de Gladys.                  |

El dispositivo **Vivienda Voltalis** ofrece la potencia actual (los últimos 10 minutos medidos por Voltalis) y un índice de energía de toda la vivienda.

Voltalis da la energía **hora a hora**, con algo de retraso: el índice avanza unas pocas veces por hora, no de forma continua. Empieza con las horas del día en que se lee el dispositivo por primera vez: Gladys solo usa sus aumentos. Una caja no mide la temperatura de las estancias: no hay sensor de temperatura.

### Widgets del panel

- **Aparatos Voltalis**: cada aparato con lo que hace y quién lo decidió (la programación, o un ajuste manual y su fin), una insignia (manual, avería, orden enviándose). Toque un aparato para ver su detalle. **Volver al programa** termina los ajustes manuales de los aparatos del widget, **Antihielo** pone sus radiadores en antihielo, ambos tras una confirmación; **Actualizar** lee ahora. Elija los aparatos en los ajustes del widget (8 como máximo).
- **Energía Voltalis**: la energía de hoy y de ayer, la potencia actual y un gráfico de barras de las últimas 24 horas, de toda la vivienda o de los aparatos elegidos en los ajustes.
- **Voltalis**: el estado de la conexión, los aparatos en modo manual, los aparatos con avería, las peticiones de la última hora, un botón **Actualizar**.

### Escenas

Disparadores (cada uno puede limitarse a un aparato):

- **Cambia el modo de un aparato**: por la programación de Voltalis o en la app MyVoltalis, nunca por la propia Gladys. Puede limitarse a un nuevo modo; el modo anterior es una variable.
- **Un aparato entra en avería** / **vuelve a la normalidad**: el autodiagnóstico de Voltalis (avería, sin consumo detectado, sin comunicación).

Acciones:

- **Poner un modo manual**: confort, eco, antihielo, una temperatura, encendido o apagado, para un aparato o todos los que tienen ese modo, durante un número de horas o hasta nuevo aviso (salidas: cambiados, rechazados).
- **Volver a la programación**: un aparato, o todos los aparatos en modo manual.
- **Activar o desactivar un programa**: los ajustes rápidos de MyVoltalis (en casa, ausencia corta, ausencia larga) o uno de sus programas, por su nombre.
- **Leer los aparatos Voltalis ahora**: devuelve los aparatos, los que están en modo manual, la potencia y la energía de hoy.

Ejemplos:

- Cuando todos salen de casa → poner todos los radiadores en antihielo; cuando alguien vuelve → volver a la programación.
- Cuando se abre una ventana del salón → apagar su radiador durante 1 hora.
- Cuando un aparato entra en avería → enviar una notificación «{{triggerEvent.data.device_name}}: {{triggerEvent.data.status}}».

### Transporte

El catálogo muestra la insignia **nube**: cada petición va a `api.myvoltalis.com`, con su correo y su contraseña. La caja Voltalis no ofrece acceso local.

## Solución de problemas

- **«Voltalis rechaza las credenciales»**: compruebe el correo y la contraseña iniciando sesión en la app MyVoltalis. La integración lo reintenta cada 30 minutos, o en cuanto los cambie.
- **Conectado, pero ningún aparato**: la cuenta no tiene aparatos en su vivienda por defecto; compruébelo en MyVoltalis.
- **Sin preajuste o sin consigna en un aparato**: MyVoltalis no le ofrece esos modos (un relé, o un radiador sin modo temperatura).
- **La energía sigue vacía o con retraso**: Voltalis rellena las horas con demora; espere a que termine una hora.
- **Una orden se deshace a los pocos minutos**: Voltalis no la aplicó; el panel vuelve a lo que dice la nube. Compruebe el aparato en MyVoltalis.
- **Todo deja de funcionar tras una actualización de MyVoltalis**: el servicio no documentado puede haber cambiado; avísenos.
- Informe de un problema en [GitHub](https://github.com/William-De71/gladys-voltalis/issues) con su versión de Gladys, la versión de la integración y el resultado de «Probar la conexión».
