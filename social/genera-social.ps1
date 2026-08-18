<#
    Risorse per la pagina LinkedIn di Velia (sonovelia.it).

        powershell -ExecutionPolicy Bypass -File social/genera-social.ps1

    Genera:
      - velia-logo-linkedin.png      400x400, il quadrato con la V (stessa
                                     voce di favicon e og/velia-logo.png)
      - velia-logo-facebook.png      500x500, stessa V
      - velia-logo-instagram.png     500x500, stessa V (il ritaglio
                                     circolare non tocca la lettera)
      - velia-copertina-linkedin.png 2256x382, il formato consigliato
                                     1128x191 raddoppiato per nitidezza
      - velia-copertina-facebook.png 1640x624, l'820x312 raddoppiato;
                                     il testo sta nella fascia centrale
                                     che il ritaglio mobile conserva
      - velia-logo-youtube.png       800x800, stessa V (ritaglio circolare)
      - velia-copertina-youtube.png  2560x1440, il banner canale; il testo
                                     sta nell'area sicura centrale di
                                     1235x338, l'unica visibile ovunque

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
# I loghi: la stessa V, alla misura consigliata da ciascuna piattaforma
# (LinkedIn 400x400; Facebook e Instagram quadrati, 500 tiene margine).
# Su Instagram il ritaglio e' circolare: la V centrata resta nel cerchio.
# --------------------------------------------------------------------------
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
foreach ($spec in @(
    @{ Lato = 400; Nome = 'velia-logo-linkedin.png' },
    @{ Lato = 500; Nome = 'velia-logo-facebook.png' },
    @{ Lato = 500; Nome = 'velia-logo-instagram.png' },
    @{ Lato = 800; Nome = 'velia-logo-youtube.png' }
)) {
    $lato = $spec.Lato
    $c = New-Canvas $lato $lato
    $g = $c.Graphics
    $fLogo = New-Object System.Drawing.Font('Georgia', [float](250 * $lato / 400), [System.Drawing.FontStyle]::Regular)
    $g.DrawString('V', $fLogo, $bWhite,
        (New-Object System.Drawing.RectangleF(0, [float](-12 * $lato / 400), $lato, $lato)), $fmt)
    $c.Bitmap.Save((Join-Path $qui $spec.Nome), [System.Drawing.Imaging.ImageFormat]::Png)
    $fLogo.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

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

# --------------------------------------------------------------------------
# Copertina Facebook 1640x624 (820x312 a 2x)
#
# Sul desktop la copertina si vede intera; sul telefono restano i 640
# centrali degli 820. Il testo sta quindi dentro la fascia centrale
# (x <= 1460 a 2x), e la parte bassa a sinistra resta decorativa perche'
# in pagina la foto profilo tonda si sovrappone li'.
# --------------------------------------------------------------------------
$w = 1640; $h = 624
$c = New-Canvas $w $h
$g = $c.Graphics

# Qui il fotogramma copre tutta la copertina; il formato e' meno panoramico
# e la sfumatura orizzontale fa da fondo al testo sulla destra.
$foto = [System.Drawing.Image]::FromFile((Join-Path $qui '..\website\public\media\hero-poster.jpg'))
$srcH = [float]($foto.Width / ($w / $h))
$srcY = [float][Math]::Max(0, $foto.Height * 0.62 - $srcH / 2)
$dest = New-Object System.Drawing.RectangleF(0, 0, $w, $h)
$src  = New-Object System.Drawing.RectangleF(0, $srcY, $foto.Width, $srcH)
$g.DrawImage($foto, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
$foto.Dispose()

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
$cb.Positions = [float[]]@(0, 0.28, 0.55, 1)
$lg.InterpolationColors = $cb
$g.FillRectangle($lg, 0, 0, $w, $h)
$lg.Dispose()

$fTitolo = New-Object System.Drawing.Font('Georgia', 58, [System.Drawing.FontStyle]::Italic)
$fSotto  = New-Object System.Drawing.Font('Georgia', 25, [System.Drawing.FontStyle]::Regular)
$fUrl    = New-Object System.Drawing.Font('Georgia', 18, [System.Drawing.FontStyle]::Regular)

$DX = 1460  # il margine destro della fascia che il telefono conserva

$titolo = 'Ciao, sono Velia.'
$mis = $g.MeasureString($titolo, $fTitolo)
$g.DrawString($titolo, $fTitolo, $bWhite, ($DX - $mis.Width), 168)

$sotto = 'Conosce come lavori, risponde come voi.'
$mis = $g.MeasureString($sotto, $fSotto)
$g.DrawString($sotto, $fSotto, $bAccent, ($DX - $mis.Width), 300)

$penLine = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#2A3038'), 2)
$g.DrawLine($penLine, ($DX - 340), 382, $DX, 382)
$penLine.Dispose()

$url = "AI per agenzie, broker e intermediari $([char]0xB7) sonovelia.it"
$mis = $g.MeasureString($url, $fUrl)
$g.DrawString($url, $fUrl, $bMuted, ($DX - $mis.Width), 402)

$c.Bitmap.Save((Join-Path $qui 'velia-copertina-facebook.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fTitolo.Dispose(); $fSotto.Dispose(); $fUrl.Dispose()
$g.Dispose(); $c.Bitmap.Dispose()

# --------------------------------------------------------------------------
# Banner YouTube 2560x1440
#
# Su TV si vede il quadro intero, sul desktop una striscia orizzontale,
# sul telefono ancora meno: l'unico rettangolo visibile ovunque e' l'area
# sicura centrale di 1235x338 (x 662..1898, y 551..889). Tutto il testo
# sta li' dentro; il resto del quadro e' fotogramma e inchiostro.
# --------------------------------------------------------------------------
$w = 2560; $h = 1440
$c = New-Canvas $w $h
$g = $c.Graphics

# Il fotogramma a tutto quadro: il poster e' piu' panoramico del 16:9,
# quindi si usa tutta l'altezza e si ritaglia un poco sui fianchi.
$foto = [System.Drawing.Image]::FromFile((Join-Path $qui '..\website\public\media\hero-poster.jpg'))
$srcW = [float]($foto.Height * ($w / $h))
$srcX = [float](($foto.Width - $srcW) / 2)
$dest = New-Object System.Drawing.RectangleF(0, 0, $w, $h)
$src  = New-Object System.Drawing.RectangleF($srcX, 0, $srcW, $foto.Height)
$g.DrawImage($foto, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
$foto.Dispose()

# La stessa sfumatura orizzontale delle altre copertine: piena
# d'inchiostro dove comincia il testo, gia' dentro l'area sicura.
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
$cb.Positions = [float[]]@(0, 0.28, 0.47, 1)
$lg.InterpolationColors = $cb
$g.FillRectangle($lg, 0, 0, $w, $h)
$lg.Dispose()

$fTitolo = New-Object System.Drawing.Font('Georgia', 58, [System.Drawing.FontStyle]::Italic)
$fSotto  = New-Object System.Drawing.Font('Georgia', 25, [System.Drawing.FontStyle]::Regular)
$fUrl    = New-Object System.Drawing.Font('Georgia', 18, [System.Drawing.FontStyle]::Regular)

$DX = 1898  # il bordo destro dell'area sicura

$titolo = 'Ciao, sono Velia.'
$mis = $g.MeasureString($titolo, $fTitolo)
$g.DrawString($titolo, $fTitolo, $bWhite, ($DX - $mis.Width), 566)

$sotto = 'Conosce come lavori, risponde come voi.'
$mis = $g.MeasureString($sotto, $fSotto)
$g.DrawString($sotto, $fSotto, $bAccent, ($DX - $mis.Width), 700)

$penLine = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#2A3038'), 2)
$g.DrawLine($penLine, ($DX - 340), 782, $DX, 782)
$penLine.Dispose()

$url = "AI per agenzie, broker e intermediari $([char]0xB7) sonovelia.it"
$mis = $g.MeasureString($url, $fUrl)
$g.DrawString($url, $fUrl, $bMuted, ($DX - $mis.Width), 802)

$c.Bitmap.Save((Join-Path $qui 'velia-copertina-youtube.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fTitolo.Dispose(); $fSotto.Dispose(); $fUrl.Dispose()
$g.Dispose(); $c.Bitmap.Dispose()

$bWhite.Dispose(); $bMuted.Dispose(); $bAccent.Dispose()

Write-Output 'Risorse social (LinkedIn, Facebook, Instagram) generate in social/.'
