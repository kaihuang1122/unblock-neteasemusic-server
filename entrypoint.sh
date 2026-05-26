#!/bin/sh

# Directory where certificates should be stored
CERT_DIR="/app/cert"
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ ! -f "$CERT_DIR/server.crt" ] || [ ! -f "$CERT_DIR/server.key" ]; then
    echo "Certificates not found. Generating new certificate pair..."
    
    # Create a temporary directory for generation
    TMP_DIR=$(mktemp -d)
    
    # 1. Generate CA key and CA certificate
    openssl genrsa -out "$TMP_DIR/ca.key" 2048
    openssl req -x509 -new -nodes -key "$TMP_DIR/ca.key" -sha256 -days 1825 \
        -out "$TMP_DIR/ca.crt" \
        -subj "/C=CN/CN=UnblockNeteaseMusic Root CA/O=nobody"
        
    # 2. Generate Server key and Certificate Signing Request (CSR)
    openssl genrsa -out "$TMP_DIR/server.key" 2048
    openssl req -new -sha256 -key "$TMP_DIR/server.key" \
        -out "$TMP_DIR/server.csr" \
        -subj "/C=CN/L=Hangzhou/O=NetEase (Hangzhou) Network Co., Ltd/OU=IT Dept./CN=*.music.163.com"
        
    # 3. Create extension file for SAN (Subject Alternative Name)
    echo "extendedKeyUsage=serverAuth" > "$TMP_DIR/extfile.cnf"
    echo "subjectAltName=DNS:music.163.com,DNS:*.music.163.com" >> "$TMP_DIR/extfile.cnf"
    
    # 4. Sign the server certificate with our CA
    openssl x509 -req -extfile "$TMP_DIR/extfile.cnf" -sha256 -days 365 \
        -in "$TMP_DIR/server.csr" \
        -CA "$TMP_DIR/ca.crt" \
        -CAkey "$TMP_DIR/ca.key" \
        -CAcreateserial \
        -out "$TMP_DIR/server.crt"
        
    # 5. Copy the generated files to the target certificate directory
    cp "$TMP_DIR/ca.crt" "$CERT_DIR/ca.crt"
    cp "$TMP_DIR/server.crt" "$CERT_DIR/server.crt"
    cp "$TMP_DIR/server.key" "$CERT_DIR/server.key"
    
    # 6. Clean up the temporary directory
    rm -rf "$TMP_DIR"
    
    echo "Certificate pair generated successfully in $CERT_DIR."
else
    echo "Using existing certificate pair found in $CERT_DIR."
fi

# Set permissions so they can be read by any user/process if needed
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/server.crt" "$CERT_DIR/server.key" 2>/dev/null || true

# Execute the main application
exec "$@"
