<#
    Genera le risorse raster del sito (OG image, icone) a partire dai token
    del design. Va rieseguito solo se cambiano marchio o palette:

        powershell -ExecutionPolicy Bypass -File scripts/generate-assets.ps1

    Le SVG (favicon) sono scritte a mano in public/ e non passano da qui.
#>

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root 'public'
New-Item -ItemType Directory -Force -Path (Join-Path $public 'og') | Out-Null

$ink       = [System.Drawing.ColorTranslator]::FromHtml('#14181D')
$hatchA    = [System.Drawing.ColorTranslator]::FromHtml('#1B2027')
$white     = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
$muted     = [System.Drawing.ColorTranslator]::FromHtml('#98A1AC')
$accent    = [System.Drawing.ColorTranslator]::FromHtml('#7F97C4')
$lineDark  = [System.Drawing.ColorTranslator]::FromHtml('#2A3038')

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'ClearTypeGridFit'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.Clear($ink)
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Add-Hatch($g, [int]$w, [int]$h) {
    # Tratteggio diagonale a 135°, la texture di fondo del design.
    $pen = New-Object System.Drawing.Pen($hatchA, 6)
    for ($i = -$h; $i -lt $w + $h; $i += 20) {
        $g.DrawLine($pen, $i, 0, $i + $h, $h)
    }
    $pen.Dispose()
}

# --------------------------------------------------------------------------
# Immagine Open Graph 1200x630
# --------------------------------------------------------------------------
$w = 1200; $h = 630
$c = New-Canvas $w $h
$g = $c.Graphics
Add-Hatch $g $w $h

# Velatura per far respirare il testo sopra al tratteggio.
$veil = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($w, 0)),
    [System.Drawing.Color]::FromArgb(252, 20, 24, 29),
    [System.Drawing.Color]::FromArgb(200, 20, 24, 29))
$g.FillRectangle($veil, 0, 0, $w, $h)
$veil.Dispose()

$fMono   = New-Object System.Drawing.Font('Consolas', 16, [System.Drawing.FontStyle]::Regular)
$fSerif  = New-Object System.Drawing.Font('Georgia', 76, [System.Drawing.FontStyle]::Regular)
$fBody   = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Regular)
$fMark   = New-Object System.Drawing.Font('Georgia', 30, [System.Drawing.FontStyle]::Regular)

$bWhite  = New-Object System.Drawing.SolidBrush($white)
$bMuted  = New-Object System.Drawing.SolidBrush($muted)
$bAccent = New-Object System.Drawing.SolidBrush($accent)

$g.DrawString('ASSIEME', $fMark, $bWhite, 72, 66)

$penLine = New-Object System.Drawing.Pen($lineDark, 1)
$g.DrawLine($penLine, 72, 138, $w - 72, 138)

$g.DrawString('La consulenza,', $fSerif, $bWhite, 60, 190)
$g.DrawString("fatta a regola d'arte", $fSerif, $bWhite, 60, 292)

$g.DrawString('AI per agenzie, broker e intermediari assicurativi', $fBody, $bMuted, 72, 432)

$g.DrawLine($penLine, 72, 520, $w - 72, 520)
$g.DrawString('DOCUMENTI · CONFRONTO · FONTE SEMPRE CITATA', $fMono, $bAccent, 70, 548)

$c.Bitmap.Save((Join-Path $public 'og\assieme-default.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $c.Bitmap.Dispose()

# --------------------------------------------------------------------------
# Logo quadrato 512x512 (dati strutturati Organization)
# --------------------------------------------------------------------------
$c = New-Canvas 512 512
$g = $c.Graphics
$fLogo = New-Object System.Drawing.Font('Georgia', 260, [System.Drawing.FontStyle]::Regular)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$g.DrawString('A', $fLogo, $bWhite, (New-Object System.Drawing.RectangleF(0, -14, 512, 512)), $fmt)
$c.Bitmap.Save((Join-Path $public 'og\assieme-logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $c.Bitmap.Dispose()

# --------------------------------------------------------------------------
# Icona iOS 180x180
# --------------------------------------------------------------------------
$c = New-Canvas 180 180
$g = $c.Graphics
$fIcon = New-Object System.Drawing.Font('Georgia', 96, [System.Drawing.FontStyle]::Regular)
$g.DrawString('A', $fIcon, $bWhite, (New-Object System.Drawing.RectangleF(0, -6, 180, 180)), $fmt)
$c.Bitmap.Save((Join-Path $public 'apple-touch-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $c.Bitmap.Dispose()

# --------------------------------------------------------------------------
# Icone PWA 192 / 512
# --------------------------------------------------------------------------
foreach ($size in 192, 512) {
    $c = New-Canvas $size $size
    $g = $c.Graphics
    $f = New-Object System.Drawing.Font('Georgia', [float]($size * 0.53), [System.Drawing.FontStyle]::Regular)
    $g.DrawString('A', $f, $bWhite, (New-Object System.Drawing.RectangleF(0, [float](-$size * 0.03), $size, $size)), $fmt)
    $c.Bitmap.Save((Join-Path $public "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $f.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

Write-Output 'Risorse generate in public/.'
