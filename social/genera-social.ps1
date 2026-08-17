<#
    Risorse per la pagina LinkedIn di Velia (sonovelia.it).

        powershell -ExecutionPolicy Bypass -File social/genera-social.ps1

    Genera:
      - velia-logo-linkedin.png      400x400, il quadrato con la V (stessa
                                     voce di favicon e og/velia-logo.png)
      - velia-copertina-linkedin.png 2256x382, il formato consigliato
                                     1128x191 raddoppiato per nitidezza

    La lingua e' quella delle immagini OG: inchiostro #14181D, la voce di
    Velia in corsivo serif, accento #7F97C4. Sulla copertina il testo vive
    nella meta' destra: in pagina il logo si sovrappone alla parte
    sinistra e il ritaglio mobile stringe ulteriormente.
#>

Add-Type -AssemblyName System.Drawing

$qui = $PSScriptRoot

$ink      = [System.Drawing.ColorTranslator]::FromHtml('#14181D')
$white    = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
$muted    = [System.Drawing.ColorTranslator]::FromHtml('#98A1AC')
$accent   = [System.Drawing.ColorTranslator]::FromHtml('#7F97C4')

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.Clear($ink)
    return @{ Bitmap = $bmp; Graphics = $g }
}

$bWhite  = New-Object System.Drawing.SolidBrush($white)
$bMuted  = New-Object System.Drawing.SolidBrush($muted)
$bAccent = New-Object System.Drawing.SolidBrush($accent)

# --------------------------------------------------------------------------
# Logo 400x400 (LinkedIn consiglia 400x400, minimo 268x268)
# --------------------------------------------------------------------------
$c = New-Canvas 400 400
$g = $c.Graphics
$fLogo = New-Object System.Drawing.Font('Georgia', 250, [System.Drawing.FontStyle]::Regular)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$g.DrawString('V', $fLogo, $bWhite, (New-Object System.Drawing.RectangleF(0, -12, 400, 400)), $fmt)
$c.Bitmap.Save((Join-Path $qui 'velia-logo-linkedin.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fLogo.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()

# --------------------------------------------------------------------------
# Copertina 2256x382 (1128x191 a 2x)
#
# A sinistra un fotogramma del video hero della home (la facciata di
# uffici di notte), che sfuma nell'inchiostro verso destra; il testo vive
# nella meta' destra perche' in pagina il logo si sovrappone alla parte
# sinistra e il ritaglio mobile stringe ancora.
# --------------------------------------------------------------------------
$w = 2256; $h = 382
$c = New-Canvas $w $h
$g = $c.Graphics

# Il fotogramma: e' il poster del video, ritagliato sulla fascia degli
# uffici illuminati e appoggiato al bordo sinistro.
$foto = [System.Drawing.Image]::FromFile((Join-Path $qui '..\website\public\media\hero-poster.jpg'))
$fotoW = 1500
$srcH = [float]($foto.Width / ($fotoW / $h))
$srcY = [float][Math]::Max(0, $foto.Height * 0.62 - $srcH / 2)
$dest = New-Object System.Drawing.RectangleF(0, 0, $fotoW, $h)
$src  = New-Object System.Drawing.RectangleF(0, $srcY, $foto.Width, $srcH)
$g.DrawImage($foto, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
$foto.Dispose()

# La sfumatura: un velo leggero gia' a sinistra (tiene insieme i toni e
# fa da fondo al logo che si sovrappone), pieno inchiostro dove sta il testo.
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, 0, $w, $h)),
    $ink, $ink,
    [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$cb = New-Object System.Drawing.Drawing2D.ColorBlend(4)
$cb.Colors = [System.Drawing.Color[]]@(
    [System.Drawing.Color]::FromArgb(55, 20, 24, 29),
    [System.Drawing.Color]::FromArgb(120, 20, 24, 29),
    [System.Drawing.Color]::FromArgb(255, 20, 24, 29),
    [System.Drawing.Color]::FromArgb(255, 20, 24, 29))
$cb.Positions = [float[]]@(0, 0.34, 0.64, 1)
$lg.InterpolationColors = $cb
$g.FillRectangle($lg, 0, 0, $w, $h)
$lg.Dispose()

$fTitolo = New-Object System.Drawing.Font('Georgia', 58, [System.Drawing.FontStyle]::Italic)
$fSotto  = New-Object System.Drawing.Font('Georgia', 25, [System.Drawing.FontStyle]::Regular)
$fUrl    = New-Object System.Drawing.Font('Georgia', 18, [System.Drawing.FontStyle]::Regular)

$DX = $w - 130  # margine destro del blocco di testo

$titolo = 'Ciao, sono Velia.'
$mis = $g.MeasureString($titolo, $fTitolo)
$g.DrawString($titolo, $fTitolo, $bWhite, ($DX - $mis.Width), 58)

$sotto = 'Conosce come lavori, risponde come voi.'
$mis = $g.MeasureString($sotto, $fSotto)
$g.DrawString($sotto, $fSotto, $bAccent, ($DX - $mis.Width), 190)

# Un filetto corto sopra l'ultima riga, come i separatori del sito.
$penLine = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#2A3038'), 2)
$g.DrawLine($penLine, ($DX - 340), 268, $DX, 268)
$penLine.Dispose()

# Il punto mediano via codice: il file resta ASCII e la codifica non inganna PS 5.1.
$url = "AI per agenzie, broker e intermediari $([char]0xB7) sonovelia.it"
$mis = $g.MeasureString($url, $fUrl)
$g.DrawString($url, $fUrl, $bMuted, ($DX - $mis.Width), 288)

$c.Bitmap.Save((Join-Path $qui 'velia-copertina-linkedin.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fTitolo.Dispose(); $fSotto.Dispose(); $fUrl.Dispose()
$g.Dispose(); $c.Bitmap.Dispose()

$bWhite.Dispose(); $bMuted.Dispose(); $bAccent.Dispose()

Write-Output 'Risorse LinkedIn generate in social/.'
