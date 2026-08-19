#!/bin/zsh
set -euo pipefail

umask 077

readonly DIIME_RELEASE_DIR="/Users/juan/Documents/Diime-Release"
readonly DIIME_KEYSTORE="$DIIME_RELEASE_DIR/diime-upload.jks"
readonly DIIME_PROPERTIES="/Users/juan/Desktop/v0-skill-hub-marketplace/android/key.properties"
readonly DIIME_ALIAS="diime-upload"
readonly DIIME_KEYTOOL="/usr/local/opt/openjdk@21/bin/keytool"

if [[ -e "$DIIME_KEYSTORE" ]]; then
  print -u2 "Ya existe $DIIME_KEYSTORE. No se sobrescribe ninguna clave."
  exit 1
fi

mkdir -p "$DIIME_RELEASE_DIR"

read -s "DIIME_STORE_PASSWORD?Contraseña nueva para la clave de subida: "
print
read -s "DIIME_STORE_PASSWORD_CONFIRM?Repítela: "
print

if [[ -z "$DIIME_STORE_PASSWORD" || "$DIIME_STORE_PASSWORD" != "$DIIME_STORE_PASSWORD_CONFIRM" ]]; then
  print -u2 "Las contraseñas no coinciden o están vacías."
  exit 1
fi

"$DIIME_KEYTOOL" -genkeypair -v \
  -keystore "$DIIME_KEYSTORE" \
  -storepass "$DIIME_STORE_PASSWORD" \
  -keypass "$DIIME_STORE_PASSWORD" \
  -alias "$DIIME_ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Diime Upload, OU=Mobile, O=Diime, L=Madrid, ST=Madrid, C=ES"

{
  print "storeFile=$DIIME_KEYSTORE"
  print "storePassword=$DIIME_STORE_PASSWORD"
  print "keyAlias=$DIIME_ALIAS"
  print "keyPassword=$DIIME_STORE_PASSWORD"
} > "$DIIME_PROPERTIES"

chmod 600 "$DIIME_KEYSTORE" "$DIIME_PROPERTIES"

print
print "Clave creada en: $DIIME_KEYSTORE"
print "Configuración privada creada en: $DIIME_PROPERTIES"
print "Guarda una copia cifrada de ambos y la contraseña en tu gestor antes de subir el primer AAB."
