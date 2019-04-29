import * as elliptic from 'elliptic';
import * as ACrypt from './ACrypt';
import * as chargyLib from './chargyLib';
import * as iface from './chargyInterfaces';

interface IEMHMeasurementValue extends iface.IMeasurementValue
{
    infoStatus:                 string,
    secondsIndex:               number,
    paginationId:               string,
    logBookIndex:               string
}

interface IEMHCrypt01Result extends iface.ICryptoResult
{
    sha256value?:                  any,
    meterId?:                      string,
    meter?:                        iface.IMeter,
    timestamp?:                    string,
    infoStatus?:                   string,
    secondsIndex?:                 string,
    paginationId?:                 string,
    obis?:                         string,
    unitEncoded?:                  string,
    scale?:                        string,
    value?:                        string,
    logBookIndex?:                 string,
    authorizationStart?:           string,
    authorizationStop?:            string,
    authorizationStartTimestamp?:  string,
    publicKey?:                    string,
    publicKeyFormat?:              string,
    signature?:                    iface.IECCSignature
}


export default class EMHCrypt01 extends ACrypt.ACrypt {

    readonly curve  = new elliptic.ec('p192');
    readonly lib    = new chargyLib.default();

    constructor(GetMeter: iface.GetMeterFunc) {
        super("ECC secp192r1",
              GetMeter);              
    }

    async SignMeasurement(measurementValue:  IEMHMeasurementValue,
                          privateKey:        any,
                          publicKey:         any): Promise<IEMHCrypt01Result>
    {

        // var keypair                      = this.curve.genKeyPair();
        //     privateKey                   = keypair.getPrivate();
        //     publicKey                    = keypair.getPublic();        
        // var privateKeyHEX                = privateKey.toString('hex').toLowerCase();
        // var publicKeyHEX                 = publicKey.encode('hex').toLowerCase();
        
        var buffer                       = new ArrayBuffer(320);
        var cryptoBuffer                 = new DataView(buffer);

        var cryptoResult:IEMHCrypt01Result = {
            status:                       iface.VerificationResult.InvalidSignature,
            meterId:                      this.lib.SetHex        (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    this.lib.SetTimestamp32(cryptoBuffer, measurementValue.timestamp,                                                 10),
            infoStatus:                   this.lib.SetHex        (cryptoBuffer, measurementValue.infoStatus,                                                14, false),
            secondsIndex:                 this.lib.SetUInt32     (cryptoBuffer, measurementValue.secondsIndex,                                              15, true),
            paginationId:                 this.lib.SetHex        (cryptoBuffer, measurementValue.paginationId,                                              19, true),
            obis:                         this.lib.SetHex        (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  this.lib.SetInt8       (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        this.lib.SetInt8       (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        this.lib.SetUInt64     (cryptoBuffer, measurementValue.value,                                                     31, true),
            logBookIndex:                 this.lib.SetHex        (cryptoBuffer, measurementValue.logBookIndex,                                              39, false),
            authorizationStart:           this.lib.SetText       (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  this.lib.SetTimestamp32(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };


        // Only the first 24 bytes/192 bits are used!
        cryptoResult.sha256value = (await this.sha256(cryptoBuffer)).toLowerCase().substring(0, 48);

        //crypto.createHash ('sha256').
                                    //           update     (cryptoBuffer).
                                    //           digest     ('hex').
                                    //           toLowerCase().
                                    //           substring  (0, 48);

        cryptoResult.publicKey    = publicKey.encode('hex').
                                            toLowerCase();

        const signature           = this.curve.keyFromPrivate(privateKey.toString('hex')).
                                            sign(cryptoResult.sha256value);

        switch (measurementValue.measurement.signatureInfos.format)
        {

            case iface.SignatureFormats.DER:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    value:      signature.toDER('hex'),
                    r:          null,
                    s:          null
                };

                return cryptoResult;


            case iface.SignatureFormats.rs:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    r:          signature.r.toString(),
                    s:          signature.s.toString()
                };

                return cryptoResult;


            //default:


        }

        cryptoResult.status = iface.VerificationResult.ValidSignature;
        return cryptoResult;

    }


    //VerifyChargingSession(chargingSession:   IChargingSession): ISessionCryptoResult
    async VerifyChargingSession(chargingSession:   iface.IChargingSession): Promise<iface.ISessionCryptoResult>
    {

        var sessionResult       = iface.SessionVerificationResult.UnknownSessionFormat;
        //var measurementResults  = new Array<IEMHCrypt01Result>();

        if (chargingSession.measurements)
        {
            for (var measurement of chargingSession.measurements)
            {

                measurement.chargingSession = chargingSession;

                // Must include at least two measurements (start & stop)
                if (measurement.values && measurement.values.length > 1)
                {

                    // Validate...
                    for (var measurementValue of measurement.values)
                    {
                        measurementValue.measurement = measurement;
                        await this.VerifyMeasurement(measurementValue as IEMHMeasurementValue);
                    }


                    // Find an overall result...
                    sessionResult = iface.SessionVerificationResult.ValidSignature;

                    for (var measurementValue of measurement.values)
                    {
                        if (sessionResult                  == iface.SessionVerificationResult.ValidSignature &&
                            measurementValue.result.status != iface.VerificationResult.ValidSignature)
                        {
                            sessionResult = iface.SessionVerificationResult.InvalidSignature;
                        }
                    }

                }

            }
        }

        return {
            status: sessionResult
        } ;

    }


    async VerifyMeasurement(measurementValue:  IEMHMeasurementValue): Promise<IEMHCrypt01Result>
    {

        function setResult(vr: iface.VerificationResult)
        {
            cryptoResult.status     = vr;
            measurementValue.result = cryptoResult;
            return cryptoResult;
        }

        var buffer        = new ArrayBuffer(320);
        var cryptoBuffer  = new DataView(buffer);

        var cryptoResult:IEMHCrypt01Result = {
            status:                       iface.VerificationResult.InvalidSignature,
            meterId:                      this.lib.SetHex        (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    this.lib.SetTimestamp32(cryptoBuffer, measurementValue.timestamp,                                                 10),
            infoStatus:                   this.lib.SetHex        (cryptoBuffer, measurementValue.infoStatus,                                                14, false),
            secondsIndex:                 this.lib.SetUInt32     (cryptoBuffer, measurementValue.secondsIndex,                                              15, true),
            paginationId:                 this.lib.SetHex        (cryptoBuffer, measurementValue.paginationId,                                              19, true),
            obis:                         this.lib.SetHex        (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  this.lib.SetInt8       (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        this.lib.SetInt8       (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        this.lib.SetUInt64     (cryptoBuffer, measurementValue.value,                                                     31, true),
            logBookIndex:                 this.lib.SetHex        (cryptoBuffer, measurementValue.logBookIndex,                                              39, false),
            authorizationStart:           this.lib.SetText       (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  this.lib.SetTimestamp32(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };

        var signatureExpected = measurementValue.signatures[0] as iface.IECCSignature;
        if (signatureExpected != null)
        {

            try
            {

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    r:          signatureExpected.r,
                    s:          signatureExpected.s
                };

                

                // Only the first 24 bytes/192 bits are used!
                cryptoResult.sha256value = (await this.sha256(cryptoBuffer)).toLowerCase().substring(0, 48);
                                        //this.crypt.createHash('sha256').
                                        //           update(cryptoBuffer).
                                        //           digest('hex').
                                        //           substring(0, 48);
                                        


                const meter = this.GetMeter(measurementValue.measurement.energyMeterId);
                if (meter != null)
                {

                    cryptoResult.meter = meter;

                    var iPublicKey = meter.publicKeys[0] as iface.IPublicKey;
                    if (iPublicKey != null)
                    {

                        try
                        {

                            cryptoResult.publicKey        = iPublicKey.value.toLowerCase();
                            cryptoResult.publicKeyFormat  = iPublicKey.format;

                            try
                            {

                                if (this.curve.keyFromPublic(cryptoResult.publicKey, 'hex').
                                               verify       (cryptoResult.sha256value,
                                                             cryptoResult.signature))
                                {
                                    return setResult(iface.VerificationResult.ValidSignature);
                                }
                                
                                return setResult(iface.VerificationResult.InvalidSignature);

                            }
                            catch (exception)
                            {
                                return setResult(iface.VerificationResult.InvalidSignature);
                            }

                        }
                        catch (exception)
                        {
                            return setResult(iface.VerificationResult.InvalidPublicKey);
                        }

                    }

                    else
                        return setResult(iface.VerificationResult.PublicKeyNotFound);

                }

                else
                    return setResult(iface.VerificationResult.EnergyMeterNotFound);


            }
            catch (exception)
            {
                return setResult(iface.VerificationResult.InvalidSignature);
            }

        }

    }


    ViewMeasurement(measurementValue:        IEMHMeasurementValue,
                    introDiv:                HTMLDivElement,
                    infoDiv:                 HTMLDivElement,
                    bufferValue:             HTMLDivElement,
                    hashedBufferValue:       HTMLDivElement,
                    publicKeyValue:          HTMLDivElement,
                    signatureExpectedValue:  HTMLDivElement,
                    signatureCheckValue:     HTMLDivElement)
    {

        const result    = measurementValue.result as IEMHCrypt01Result;

        //const cryptoDiv = CreateDiv(introDiv,  "row");
        //                  CreateDiv(cryptoDiv, "id",    "Kryptoverfahren");
        //                  CreateDiv(cryptoDiv, "value", "EMHCrypt01 (" + this.description + ")");

        const cryptoSpan = introDiv.querySelector('#cryptoAlgorithm') as HTMLSpanElement;
        cryptoSpan.innerHTML = "EMHCrypt01 (" + this.description + ")";

        hashedBufferValue.parentElement.children[0].innerHTML = "Hashed Puffer (SHA256, 24 bytes)";
 
        this.CreateLine("Zählernummer",             measurementValue.measurement.energyMeterId,                                          result.meterId,                      infoDiv, bufferValue);
        this.CreateLine("Zeitstempel",              this.lib.parseUTC(measurementValue.timestamp),                                                result.timestamp,                    infoDiv, bufferValue);
        this.CreateLine("Status",                   "0x" + measurementValue.infoStatus,                                                  result.infoStatus,                   infoDiv, bufferValue);
        this.CreateLine("Sekundenindex",            measurementValue.secondsIndex,                                                       result.secondsIndex,                 infoDiv, bufferValue);
        this.CreateLine("Paginierungszähler",       parseInt(measurementValue.paginationId, 16),                                         result.paginationId,                 infoDiv, bufferValue);
        this.CreateLine("OBIS-Kennzahl",            this.lib.parseOBIS(measurementValue.measurement.obis),                                        result.obis,                         infoDiv, bufferValue);
        this.CreateLine("Einheit (codiert)",        measurementValue.measurement.unitEncoded,                                            result.unitEncoded,                  infoDiv, bufferValue);
        this.CreateLine("Skalierung",               measurementValue.measurement.scale,                                                  result.scale,                        infoDiv, bufferValue);
        this.CreateLine("Messwert",                 measurementValue.value + " Wh",                                                      result.value,                        infoDiv, bufferValue);
        this.CreateLine("Logbuchindex",             "0x" + measurementValue.logBookIndex,                                                result.logBookIndex,                 infoDiv, bufferValue);
        this.CreateLine("Autorisierung",            measurementValue.measurement.chargingSession.authorizationStart["@id"],              result.authorizationStart,           infoDiv, bufferValue);
        this.CreateLine("Autorisierungszeitpunkt",  this.lib.parseUTC(measurementValue.measurement.chargingSession.authorizationStart.timestamp), result.authorizationStartTimestamp,  infoDiv, bufferValue);


        // Buffer
        bufferValue.parentElement.children[0].innerHTML = "Puffer (320 Bytes)";
        hashedBufferValue.innerHTML      = "0x" + result.sha256value;


        // Public Key
        publicKeyValue.parentElement.children[0].innerHTML = "Public Key";
        
        if (result.publicKeyFormat)
            publicKeyValue.parentElement.children[0].innerHTML += " (" + result.publicKeyFormat + ")";

        publicKeyValue.innerHTML         = "0x" + result.publicKey;


        // Signature
        signatureExpectedValue.parentElement.children[0].innerHTML = "Erwartete Signatur (" + result.signature.format + ")";

        if (result.signature.r && result.signature.s)
            signatureExpectedValue.innerHTML = "r: 0x" + result.signature.r.toLowerCase() + "<br />" + "s: 0x" + result.signature.s.toLowerCase();

        else if (result.signature.value)
            signatureExpectedValue.innerHTML = "0x" + result.signature.value.toLowerCase();


        // Result
        switch (result.status)
        {

            case iface.VerificationResult.UnknownCTRFormat:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Unbekanntes Transparenzdatenformat</div>';
                break;

            case iface.VerificationResult.EnergyMeterNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Energiezähler</div>';
                break;

            case iface.VerificationResult.PublicKeyNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case iface.VerificationResult.InvalidPublicKey:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case iface.VerificationResult.InvalidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

            case iface.VerificationResult.ValidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-check-circle"></i><div id="description">Gültige Signatur</div>';
                break;


            default:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

        }


    }

}