<#
    Contenuti per i feed di Velia (LinkedIn, Facebook, Instagram).

        powershell -ExecutionPolicy Bypass -File social/genera-contenuti.ps1

    Genera in social/contenuti/ le tavole quadrate 1080x1080: le card
    singole e i tre caroselli da cinque tavole (fonti, glossario,
    settimana). Il piano d'uso sta in social/piano-editoriale.md.

    La lingua e' quella delle copertine: inchiostro #14181D, la voce di
    Velia in corsivo Georgia, accento #7F97C4, il fotogramma del video
    hero sulle tavole d'apertura.

    NOTA: il file deve restare in UTF-8 con BOM, altrimenti PowerShell 5.1
    legge male le lettere accentate dei testi.
#>

Add-Type -AssemblyName System.Drawing

$qui = $PSScriptRoot
$out = Join-Path $qui 'contenuti'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$ink    = [System.Drawing.ColorTranslator]::FromHtml('#14181D')
$white  = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
$soft   = [System.Drawing.ColorTranslator]::FromHtml('#D9D6CD')
$muted  = [System.Drawing.ColorTranslator]::FromHtml('#98A1AC')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#7F97C4')
$linea  = [System.Drawing.ColorTranslator]::FromHtml('#2A3038')

$bWhite  = New-Object System.Drawing.SolidBrush($white)
$bSoft   = New-Object System.Drawing.SolidBrush($soft)
$bMuted  = New-Object System.Drawing.SolidBrush($muted)
$bAccent = New-Object System.Drawing.SolidBrush($accent)

$fotoPercorso = Join-Path $qui '..\website\public\media\hero-poster.jpg'

# Maiuscole spaziate: il ruolo "mono" delle etichette, come sul sito.
function Spazia([string]$s) { return ($s.ToUpper().ToCharArray() -join ' ') }

<#
    Una tavola 1080x1080. Le chiavi dello spec:
      Nome          nome del file in social/contenuti/
      Kicker        etichetta di rubrica in alto a sinistra
      Etichetta     riga d'accento sopra il testo (01, LUNEDI', ...)
      Testo         il testo principale
      Corsivo       $true per la voce di Velia (statement), $false per i titoli
      CorpoPt       corpo del testo principale in punti
      Sotto         riga secondaria sotto il testo (facoltativa)
      SottoAccent   $true per la riga secondaria in blu (es. sonovelia.it)
      Pagina        numerazione carosello ("1/5"); vuota per le card
      Band          $true per la fascia col fotogramma del video in basso
      Pannello      percorso di uno screen dell'app (social/screen/): va in
                    un riquadro bordato sotto il testo; Sotto viene ignorato
      PannelloY     frazione verticale dello screen da cui parte il ritaglio

    Gli screen in social/screen/ sono fotogrammi veri del video della
    home (memoria-viva.mp4), estratti con l'ffmpeg di Remotion:
      velia-video\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe
        -ss <secondi> -i website\public\media\memoria-viva.mp4 -frames:v 1 out.png
#>
function Tavola($spec) {
    $lato = 1080
    $bmp = New-Object System.Drawing.Bitmap($lato, $lato)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.Clear($ink)

    $fKicker = New-Object System.Drawing.Font('Consolas', 16, [System.Drawing.FontStyle]::Regular)
    $fEtich  = New-Object System.Drawing.Font('Consolas', 20, [System.Drawing.FontStyle]::Regular)
    $stile = [System.Drawing.FontStyle]::Regular
    if ($spec.Corsivo) { $stile = [System.Drawing.FontStyle]::Italic }
    $fTesto  = New-Object System.Drawing.Font('Georgia', [float]$spec.CorpoPt, $stile)
    $fSotto  = New-Object System.Drawing.Font('Georgia', 24, [System.Drawing.FontStyle]::Regular)
    $fPiede  = New-Object System.Drawing.Font('Georgia', 20, [System.Drawing.FontStyle]::Italic)
    $fPagina = New-Object System.Drawing.Font('Consolas', 16, [System.Drawing.FontStyle]::Regular)

    $MARG = 90
    $LARG = $lato - 2 * $MARG

    # La fascia col fotogramma, solo sulle tavole d'apertura.
    $fondoBand = $lato
    if ($spec.Band) {
        $fondoBand = 830
        $foto = [System.Drawing.Image]::FromFile($fotoPercorso)
        $altezza = $lato - $fondoBand
        $srcH = [float]($foto.Width / ($lato / $altezza))
        $srcY = [float][Math]::Max(0, $foto.Height * 0.62 - $srcH / 2)
        $dest = New-Object System.Drawing.RectangleF(0, $fondoBand, $lato, $altezza)
        $src  = New-Object System.Drawing.RectangleF(0, $srcY, $foto.Width, $srcH)
        $g.DrawImage($foto, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
        $foto.Dispose()

        # La fascia nasce dall'inchiostro: piena in alto, velata in basso.
        $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Rectangle(0, $fondoBand, $lato, $altezza)),
            [System.Drawing.Color]::FromArgb(255, 20, 24, 29),
            [System.Drawing.Color]::FromArgb(70, 20, 24, 29),
            [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
        $g.FillRectangle($lg, 0, $fondoBand, $lato, $altezza)
        $lg.Dispose()
    }

    # Il kicker di rubrica e, sulle tavole d'apertura, la numerazione in alto.
    if ($spec.Kicker) {
        $g.DrawString((Spazia $spec.Kicker), $fKicker, $bAccent, $MARG, 84)
    }
    if ($spec.Band -and $spec.Pagina) {
        $mis = $g.MeasureString($spec.Pagina, $fPagina)
        $g.DrawString($spec.Pagina, $fPagina, $bMuted, ($lato - $MARG - $mis.Width), 84)
    }

    # Il blocco centrale: etichetta, testo, riga secondaria. Con lo screen
    # dell'app il testo si ancora in alto e il riquadro prende il resto.
    $altoRegione = 180
    $bassoRegione = $fondoBand - 60
    if (-not $spec.Band) { $bassoRegione = 900 }

    $hEtich = 0
    if ($spec.Etichetta) { $hEtich = 64 }
    $misTesto = $g.MeasureString($spec.Testo, $fTesto, $LARG)
    $hSotto = 0
    if ($spec.Sotto -and -not $spec.Pannello) {
        $misSotto = $g.MeasureString($spec.Sotto, $fSotto, $LARG)
        $hSotto = $misSotto.Height + 36
    }
    $totale = $hEtich + $misTesto.Height + $hSotto
    $y = $altoRegione + ($bassoRegione - $altoRegione - $totale) / 2
    if ($spec.Pannello) { $y = 168 }

    if ($spec.Etichetta) {
        $g.DrawString((Spazia $spec.Etichetta), $fEtich, $bAccent, $MARG, [float]$y)
        $y += $hEtich
    }
    $g.DrawString($spec.Testo, $fTesto, $bWhite,
        (New-Object System.Drawing.RectangleF($MARG, [float]$y, $LARG, ($misTesto.Height + 20))))
    $y += $misTesto.Height + 36
    if ($spec.Sotto -and -not $spec.Pannello) {
        $bRiga = $bSoft
        if ($spec.SottoAccent) { $bRiga = $bAccent }
        $g.DrawString($spec.Sotto, $fSotto, $bRiga,
            (New-Object System.Drawing.RectangleF($MARG, [float]$y, $LARG, ($misSotto.Height + 20))))
    }

    # Il riquadro con lo screen dell'app, bordato dal filetto scuro.
    if ($spec.Pannello) {
        $px = $MARG; $py = 470; $pw = $LARG; $ph = 450
        $screen = [System.Drawing.Image]::FromFile((Join-Path $qui $spec.Pannello))
        $frazione = 0.0
        if ($spec.PannelloY) { $frazione = [float]$spec.PannelloY }
        $srcH = [float]($screen.Width / ($pw / $ph))
        $srcY = [float][Math]::Min($screen.Height * $frazione, $screen.Height - $srcH)
        $destR = New-Object System.Drawing.RectangleF($px, $py, $pw, $ph)
        $srcR  = New-Object System.Drawing.RectangleF(0, $srcY, $screen.Width, $srcH)
        $g.DrawImage($screen, $destR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
        $screen.Dispose()
        $pen = New-Object System.Drawing.Pen($linea, 2)
        $g.DrawRectangle($pen, $px, $py, $pw, $ph)
        $pen.Dispose()
    }

    # Il piede: filetto, la firma a sinistra, pagina o indirizzo a destra.
    if (-not $spec.Band) {
        $pen = New-Object System.Drawing.Pen($linea, 2)
        $g.DrawLine($pen, $MARG, 946, ($lato - $MARG), 946)
        $pen.Dispose()
        $g.DrawString('sono Velia.', $fPiede, $bWhite, $MARG, 968)
        $destra = $spec.Pagina
        if (-not $destra) { $destra = 'sonovelia.it' }
        $mis = $g.MeasureString($destra, $fPagina)
        $g.DrawString($destra, $fPagina, $bMuted, ($lato - $MARG - $mis.Width), 974)
    }

    $bmp.Save((Join-Path $out $spec.Nome), [System.Drawing.Imaging.ImageFormat]::Png)
    $fKicker.Dispose(); $fEtich.Dispose(); $fTesto.Dispose(); $fSotto.Dispose()
    $fPiede.Dispose(); $fPagina.Dispose()
    $g.Dispose(); $bmp.Dispose()
    return $spec.Nome
}

$tavole = @(
    # ---- Card singole -----------------------------------------------------
    @{ Nome = 'card-lancio.png'; Kicker = 'sono velia'; Testo = 'Ciao, sono Velia.'
       Corsivo = $true; CorpoPt = 72; Sotto = 'Conosce come lavori, risponde come voi.'
       Band = $true; Pagina = '' },
    @{ Nome = 'card-slogan.png'; Kicker = 'la voce'; Testo = 'Conosce come lavori, risponde come voi.'
       Corsivo = $true; CorpoPt = 54; Sotto = 'AI per agenzie, broker e intermediari.' },
    @{ Nome = 'card-confronto.png'; Kicker = 'sotto il cofano'
       Testo = 'Decine di prodotti a confronto, la fonte in ogni casella.'
       Corsivo = $true; CorpoPt = 40
       Pannello = 'screen\app-tabella.png'; PannelloY = 0.02 },
    @{ Nome = 'card-documenti.png'; Kicker = 'sotto il cofano'
       Testo = 'Il documento per il cliente esce già impaginato, col tuo marchio.'
       Corsivo = $true; CorpoPt = 50 },
    @{ Nome = 'card-strumenti.png'; Kicker = 'sotto il cofano'
       Testo = 'I tuoi archivi parlano anche con gli strumenti AI che già usi.'
       Corsivo = $true; CorpoPt = 50 },
    @{ Nome = 'card-dal-campo.png'; Kicker = 'dal campo'
       Testo = 'Quello che sa il collega più esperto, a portata di domanda.'
       Corsivo = $true; CorpoPt = 40
       Pannello = 'screen\app-memoria.png'; PannelloY = 0.18 },
    @{ Nome = 'card-demo.png'; Kicker = 'richiedi una demo'
       Testo = "Vedila all'opera sulla tua casistica."
       Corsivo = $true; CorpoPt = 54; Sotto = 'sonovelia.it'; SottoAccent = $true },

    # ---- Carosello: la fonte, sempre --------------------------------------
    @{ Nome = 'carosello-fonti-1.png'; Kicker = 'la fonte, sempre'
       Testo = 'Da dove viene questa risposta?'
       Corsivo = $true; CorpoPt = 64; Band = $true; Pagina = '1/5' },
    @{ Nome = 'carosello-fonti-2.png'; Kicker = 'la fonte, sempre'; Etichetta = '01'
       Testo = 'Ogni risposta indica il documento, la pagina e la data da cui viene.'
       Corsivo = $true; CorpoPt = 38; Pagina = '2/5'
       Pannello = 'screen\app-memoria.png'; PannelloY = 0.30 },
    @{ Nome = 'carosello-fonti-3.png'; Kicker = 'la fonte, sempre'; Etichetta = '02'
       Testo = 'Vale per i tuoi archivi come per la biblioteca pubblica: la risposta e la sua fonte viaggiano insieme.'
       Corsivo = $true; CorpoPt = 44; Pagina = '3/5' },
    @{ Nome = 'carosello-fonti-4.png'; Kicker = 'la fonte, sempre'; Etichetta = '03'
       Testo = "E se la fonte non c'è, Velia lo dice: meglio un non lo so che una risposta inventata."
       Corsivo = $true; CorpoPt = 44; Pagina = '4/5' },
    @{ Nome = 'carosello-fonti-5.png'; Kicker = 'la fonte, sempre'
       Testo = 'La fiducia si costruisce una citazione alla volta.'
       Corsivo = $true; CorpoPt = 54; Sotto = 'sonovelia.it'; SottoAccent = $true; Pagina = '5/5' },

    # ---- Carosello: glossario ---------------------------------------------
    @{ Nome = 'carosello-glossario-1.png'; Kicker = 'glossario'
       Testo = 'Tre parole di polizza, spiegate come al bancone.'
       Corsivo = $true; CorpoPt = 60; Band = $true; Pagina = '1/5' },
    @{ Nome = 'carosello-glossario-2.png'; Kicker = 'glossario'; Etichetta = '01'
       Testo = 'Franchigia'; Corsivo = $false; CorpoPt = 66
       Sotto = "La parte di danno che resta a carico dell'assicurato: sotto quella soglia la compagnia non paga."
       Pagina = '2/5' },
    @{ Nome = 'carosello-glossario-3.png'; Kicker = 'glossario'; Etichetta = '02'
       Testo = 'Massimale'; Corsivo = $false; CorpoPt = 66
       Sotto = 'Il tetto oltre il quale la compagnia non risarcisce, qualunque sia il danno.'
       Pagina = '3/5' },
    @{ Nome = 'carosello-glossario-4.png'; Kicker = 'glossario'; Etichetta = '03'
       Testo = 'Rivalsa'; Corsivo = $false; CorpoPt = 66
       Sotto = "Il diritto della compagnia di farsi restituire dall'assicurato quanto pagato al terzo, nei casi previsti."
       Pagina = '4/5' },
    @{ Nome = 'carosello-glossario-5.png'; Kicker = 'glossario'
       Testo = 'Le parole del mestiere, senza il mestiere di capirle.'
       Corsivo = $true; CorpoPt = 54; Sotto = 'Il glossario completo è su sonovelia.it'; SottoAccent = $true
       Pagina = '5/5' },

    # ---- Carosello: una settimana in agenzia -------------------------------
    @{ Nome = 'carosello-settimana-1.png'; Kicker = 'dal campo'
       Testo = 'Una settimana in agenzia, con Velia.'
       Corsivo = $true; CorpoPt = 60; Band = $true; Pagina = '1/5' },
    @{ Nome = 'carosello-settimana-2.png'; Kicker = 'dal campo'; Etichetta = 'lunedì'
       Testo = 'Arriva la circolare nuova: da oggi le risposte ne tengono conto, con la data in evidenza.'
       Corsivo = $true; CorpoPt = 44; Pagina = '2/5' },
    @{ Nome = 'carosello-settimana-3.png'; Kicker = 'dal campo'; Etichetta = 'mercoledì'
       Testo = 'Un preventivo da difendere: la tabella confronta le garanzie di dieci prodotti, fonte per fonte.'
       Corsivo = $true; CorpoPt = 44; Pagina = '3/5' },
    @{ Nome = 'carosello-settimana-4.png'; Kicker = 'dal campo'; Etichetta = 'venerdì'
       Testo = 'Il cliente vuole nero su bianco: il documento esce impaginato col marchio della tua agenzia.'
       Corsivo = $true; CorpoPt = 44; Pagina = '4/5' },
    @{ Nome = 'carosello-settimana-5.png'; Kicker = 'dal campo'
       Testo = 'Il lunedì dopo, tutto quello che avete risolto è già memoria.'
       Corsivo = $true; CorpoPt = 54; Sotto = 'sonovelia.it'; SottoAccent = $true; Pagina = '5/5' }
)

$generate = @()
foreach ($spec in $tavole) { $generate += Tavola $spec }

$bWhite.Dispose(); $bSoft.Dispose(); $bMuted.Dispose(); $bAccent.Dispose()

Write-Output "Generate $($generate.Count) tavole in social/contenuti/."
