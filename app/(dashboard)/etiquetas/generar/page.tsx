"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, QrCode, Printer, Download, Info, Plus } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getCurrentUser } from "@/lib/auth"
import { WASTE_TYPES } from "@/lib/constants"
import { useToast } from "@/hooks/use-toast"
import QRCodeLib from "qrcode"
import Image from "next/image"

interface Residuo {
  id: string
  tipo: string
  cantidad: number
  ubicacion: string
  fecha_generacion: string
  estado: string
  usuario_id: string
  users?: {
    nombre_completo: string
    departamento: string
  }
}

export default function GenerarEtiquetaPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [residuos, setResiduos] = useState<Residuo[]>([])
  const [selectedResiduo, setSelectedResiduo] = useState<string>("")
  const [tipoEtiqueta, setTipoEtiqueta] = useState<"QR" | "codigo_barras">("QR")

  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [generatedCode, setGeneratedCode] = useState<string>("")

  // Cargar residuos desde la base de datos al montar
  useEffect(() => {
    async function fetchResiduos() {
      const { data, error } = await supabase
        .from("residuos")
        .select(`
          id,
          tipo,
          cantidad,
          ubicacion,
          fecha_generacion,
          estado,
          usuario_id,
          users (
            nombre_completo,
            departamento
          )
        `)
        .eq("estado", "generado");

      if (error) {
        console.error("Error al obtener residuos:", error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los residuos",
          variant: "destructive",
        });
        return;
      }
      
      console.log("Residuos cargados:", data);
      // Transformar los datos para que coincidan con la interfaz
      const residuosTransformados = data?.map(residuo => ({
        ...residuo,
        users: Array.isArray(residuo.users) ? residuo.users[0] : residuo.users
      })) || [];
      
      setResiduos(residuosTransformados);
    }
    fetchResiduos();
  }, [toast]);

  // Función para crear residuos de prueba
  const createSampleResiduos = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        toast({
          title: "Error",
          description: "No hay usuario autenticado",
          variant: "destructive",
        });
        return;
      }

      const sampleResiduos = [
        {
          tipo: 'anatomopatologicos',
          cantidad: 2.5,
          ubicacion: 'Quirófano 1',
          fecha_generacion: new Date().toISOString(),
          usuario_id: currentUser.id,
          estado: 'generado'
        },
        {
          tipo: 'cortopunzantes',
          cantidad: 1.2,
          ubicacion: 'Laboratorio',
          fecha_generacion: new Date().toISOString(),
          usuario_id: currentUser.id,
          estado: 'generado'
        },
        {
          tipo: 'farmaceuticos',
          cantidad: 3.8,
          ubicacion: 'Farmacia',
          fecha_generacion: new Date().toISOString(),
          usuario_id: currentUser.id,
          estado: 'generado'
        }
      ];

      const { data, error } = await supabase
        .from('residuos')
        .insert(sampleResiduos)
        .select();

      if (error) {
        console.error('Error creando residuos de prueba:', error);
        toast({
          title: "Error",
          description: "No se pudieron crear los residuos de prueba",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Éxito",
        description: `Se crearon ${data.length} residuos de prueba`,
      });

      // Recargar la lista
      window.location.reload();

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error inesperado",
        variant: "destructive",
      });
    }
  };

  // Usar useCallback para memoizar generatePreview
  const generatePreview = useCallback(async () => {
    try {
      const residuo = residuos.find((r) => r.id === selectedResiduo)
      if (!residuo) return

      // Generar código único
      const timestamp = Date.now()
      const code = `${tipoEtiqueta}-${residuo.tipo.toUpperCase()}-${timestamp}`
      setGeneratedCode(code)

      if (tipoEtiqueta === "QR") {
        // Generar QR code
        const qrData = JSON.stringify({
          id: residuo.id,
          tipo: residuo.tipo,
          cantidad: residuo.cantidad,
          ubicacion: residuo.ubicacion,
          fecha: residuo.fecha_generacion,
          codigo: code,
        })

        const qrUrl = await QRCodeLib.toDataURL(qrData, {
          width: 200,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        })
        setQrCodeUrl(qrUrl)
      }
    } catch (error) {
      console.error("Error generating preview:", error)
    }
  }, [selectedResiduo, tipoEtiqueta, residuos])

  useEffect(() => {
    if (selectedResiduo && tipoEtiqueta) {
      generatePreview()
    }
  }, [selectedResiduo, tipoEtiqueta, generatePreview])

  const handleGenerate = async () => {
    if (!selectedResiduo || !tipoEtiqueta) {
      toast({
        title: "Error",
        description: "Selecciona un residuo y tipo de etiqueta",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from("etiquetas")
        .insert({
          residuo_id: selectedResiduo,
          tipo_etiqueta: tipoEtiqueta,
          codigo_qr: generatedCode,
          impresa: false,
        })
        .select()
        .single()

      if (error) throw error

      // Actualizar estado del residuo
      await supabase.from("residuos").update({ estado: "etiquetado" }).eq("id", selectedResiduo)

      toast({
        title: "Etiqueta generada",
        description: "La etiqueta ha sido generada exitosamente",
      })

      router.push(`/etiquetas/${data.id}`)
    } catch (error) {
      console.error("Error generating etiqueta:", error)
      toast({
        title: "Error",
        description: "No se pudo generar la etiqueta. Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedResiduoData = residuos.find((r) => r.id === selectedResiduo)
  const wasteType = selectedResiduoData ? WASTE_TYPES.find((w) => w.value === selectedResiduoData.tipo) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generar Etiqueta</h1>
          <p className="text-muted-foreground">Crear código QR o de barras para trazabilidad</p>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Las etiquetas generadas contendrán toda la información necesaria para la trazabilidad del residuo. Asegúrate
          de imprimir la etiqueta inmediatamente después de generarla.
        </AlertDescription>
      </Alert>

      {/* Botón temporal para crear residuos de prueba */}
      {residuos.length === 0 && (
        <Alert>
          <Plus className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>No hay residuos disponibles. ¿Quieres crear algunos residuos de prueba?</span>
            <Button onClick={createSampleResiduos} size="sm">
              Crear Residuos de Prueba
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Etiqueta</CardTitle>
              <CardDescription>Selecciona el residuo y tipo de etiqueta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Selección de Residuo */}
              <div className="space-y-2">
                <Label>Residuo *</Label>
                <Select value={selectedResiduo} onValueChange={setSelectedResiduo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un residuo sin etiqueta" />
                  </SelectTrigger>
                  <SelectContent>
                    {residuos.length === 0 ? (
                      <SelectItem value="no-data" disabled>
                        No hay residuos disponibles
                      </SelectItem>
                    ) : (
                      residuos.map((residuo) => {
                        const type = WASTE_TYPES.find((w) => w.value === residuo.tipo)
                        return (
                          <SelectItem key={residuo.id} value={residuo.id}>
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded-full bg-${type?.color || "gray"}-500`} />
                              <span>{type?.label || residuo.tipo}</span>
                              <span className="text-muted-foreground">
                                - {residuo.cantidad}kg - {residuo.ubicacion}
                              </span>
                            </div>
                          </SelectItem>
                        )
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de Etiqueta */}
              <div className="space-y-3">
                <Label>Tipo de Etiqueta *</Label>
                <RadioGroup
                  value={tipoEtiqueta}
                  onValueChange={(value: "QR" | "codigo_barras") => setTipoEtiqueta(value)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="QR" id="qr" />
                    <Label htmlFor="qr" className="flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      Código QR
                      <Badge variant="secondary">Recomendado</Badge>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="codigo_barras" id="barras" />
                    <Label htmlFor="barras" className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 bg-current"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(90deg, transparent, transparent 1px, currentColor 1px, currentColor 2px)",
                        }}
                      />
                      Código de Barras
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Información del Residuo Seleccionado */}
              {selectedResiduoData && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium">Información del Residuo</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Tipo</Label>
                      <div className="flex items-center gap-2">
                        {wasteType && <div className={`h-3 w-3 rounded-full bg-${wasteType.color}-500`} />}
                        <span>{wasteType?.label || selectedResiduoData.tipo}</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Cantidad</Label>
                      <p>{selectedResiduoData.cantidad} kg</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Ubicación</Label>
                      <p>{selectedResiduoData.ubicacion}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Usuario</Label>
                      <p>{selectedResiduoData.users?.nombre_completo || 'Usuario desconocido'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <Button onClick={handleGenerate} disabled={loading || !selectedResiduo} className="w-full">
                {loading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Generando...
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2 h-4 w-4" />
                    Generar Etiqueta
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vista Previa</CardTitle>
              <CardDescription>Previsualización de la etiqueta a generar</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedResiduo && generatedCode ? (
                <div className="space-y-4">
                  {/* QR Code Preview */}
                  {tipoEtiqueta === "QR" && qrCodeUrl && (
                    <div className="flex flex-col items-center space-y-2">
                      <Image src={qrCodeUrl} alt="QR Code" width={200} height={200} className="border rounded" />
                      <p className="text-sm text-muted-foreground font-mono">{generatedCode}</p>
                    </div>
                  )}

                  {/* Barcode Preview */}
                  {tipoEtiqueta === "codigo_barras" && (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="h-16 w-48 bg-white border rounded flex items-center justify-center">
                        <div
                          className="h-12 w-40 bg-current opacity-80"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(90deg, transparent, transparent 1px, currentColor 1px, currentColor 3px)",
                          }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">{generatedCode}</p>
                    </div>
                  )}

                  {/* Label Info */}
                  <div className="space-y-2 text-sm border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span>{wasteType?.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cantidad:</span>
                      <span>{selectedResiduoData?.cantidad} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ubicación:</span>
                      <span>{selectedResiduoData?.ubicacion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fecha:</span>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                      <Download className="mr-2 h-4 w-4" />
                      Descargar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  <div className="text-center">
                    <QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Selecciona un residuo para ver la vista previa</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Guidelines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recomendaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-blue-500 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Códigos QR</p>
                  <p className="text-muted-foreground">Almacenan más información y son más resistentes a daños</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Códigos de Barras</p>
                  <p className="text-muted-foreground">Compatibles con lectores básicos y más rápidos de escanear</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-orange-500 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Impresión</p>
                  <p className="text-muted-foreground">Usa papel resistente al agua y adhesivo fuerte</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
