import { X509Certificate } from "crypto";

interface AttestationResult {
  status: string
  risk: number
  issuer?: string
  subject?: string
}

export async function verifyDeviceAttestation(
  attestationCertBase64: string
): Promise<AttestationResult> {

  try {

    if (!attestationCertBase64) {
      return {
        status: "ATTESTATION_MISSING",
        risk: 80
      }
    }

    const certBuffer = Buffer.from(attestationCertBase64, "base64")

    const cert = new X509Certificate(certBuffer)

    const issuer = cert.issuer
    const subject = cert.subject

    /* =========================
       CERT VALIDITY
    ========================= */

    const validFrom = new Date(cert.validFrom)
    const validTo = new Date(cert.validTo)
    const now = new Date()

    if (now < validFrom || now > validTo) {

      return {
        status: "ATTESTATION_CERT_EXPIRED",
        risk: 90
      }

    }

    /* =========================
       ANDROID KEYSTORE CHECK
    ========================= */

    const isAndroidKeyStore =
      issuer.includes("Android") ||
      issuer.includes("Google") ||
      subject.includes("Android")

    if (!isAndroidKeyStore) {

      return {
        status: "NOT_ANDROID_KEYSTORE",
        risk: 100,
        issuer,
        subject
      }

    }

    /* =========================
       BASIC ROOT CHECK
    ========================= */

    if (issuer.includes("Fake") || issuer.includes("Test")) {

      return {
        status: "UNTRUSTED_CERT_ISSUER",
        risk: 100,
        issuer
      }

    }

    /* =========================
       DEVICE TRUST SCORE BASELINE
    ========================= */

    let risk = 0

    if (!issuer.includes("Google")) {
      risk += 20
    }

    /* =========================
       SUCCESS
    ========================= */

    return {
      status: "ATTESTATION_VALID",
      risk,
      issuer,
      subject
    }

  } catch (error) {

    console.error("Attestation verification failed:", error)

    return {
      status: "ATTESTATION_ERROR",
      risk: 100
    }

  }

}