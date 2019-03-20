///<reference path="chargyInterfaces.ts" />
///<reference path="chargyLib.ts" />
///<reference path="ACrypt.ts" />

import * as elliptic from 'elliptic';

interface IGDFMeasurementValue extends IMeasurementValue
{
    prevSignature:                 string,
}

interface IGDFCrypt01Result extends ICryptoResult
{
    sha256value?:                  any,
    meterId?:                      string,
    meter?:                        IMeter,
    timestamp?:                    string,
    obis?:                         string,
    unitEncoded?:                  string,
    scale?:                        string,
    value?:                        string,
    authorizationStart?:           string,
    authorizationStartTimestamp?:  string,
    publicKey?:                    string,
    publicKeyFormat?:              string,
    signature?:                    IECCSignature
}

export default class GDFCrypt01 extends ACrypt {

    readonly curve        = new elliptic.ec('p256');
    
    
    constructor(GetMeter: GetMeterFunc) {
        super("ECC secp256r1",
              GetMeter);              
    }


    SignMeasurement(measurementValue:  IGDFMeasurementValue,
                    privateKey:        any,
                    publicKey:         any): IGDFCrypt01Result
    {

        // var keypair                      = this.curve.genKeyPair();
        //     privateKey                   = keypair.getPrivate();
        //     publicKey                    = keypair.getPublic();        
        // var privateKeyHEX                = privateKey.toString('hex').toLowerCase();
        // var publicKeyHEX                 = publicKey.encode('hex').toLowerCase();
        
        var buffer                       = new ArrayBuffer(320);
        var cryptoBuffer                 = new DataView(buffer);

        var cryptoResult:IGDFCrypt01Result = {
            status:                       VerificationResult.InvalidSignature,
            meterId:                      SetText     (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    SetTimestamp(cryptoBuffer, measurementValue.timestamp,                                                 10),
            obis:                         SetHex      (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  SetInt8     (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        SetInt8     (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        SetUInt64   (cryptoBuffer, measurementValue.value,                                                     31, true),
            authorizationStart:           SetHex      (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  SetTimestamp(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };

        cryptoResult.sha256value  = //this.crypt.createHash('sha256').
                                           //           update(cryptoBuffer).
                                           //           digest('hex');
                                           this.sha256(cryptoBuffer).then(function(hash) {
                                            return hash.toLowerCase()
                                          });

        cryptoResult.publicKey    = publicKey.encode('hex').
                                              toLowerCase();

        const signature           = this.curve.keyFromPrivate(privateKey.toString('hex')).
                                               sign(cryptoResult.sha256value);

        switch (measurementValue.measurement.signatureInfos.format)
        {

            case SignatureFormats.DER:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    value:      signature.toDER('hex'),
                    r:          null,
                    s:          null
                };

                return cryptoResult;


            case SignatureFormats.rs:

                cryptoResult.signature = {
                    algorithm:  measurementValue.measurement.signatureInfos.algorithm,
                    format:     measurementValue.measurement.signatureInfos.format,
                    r:          signature.r.toString(),
                    s:          signature.s.toString()
                };

                return cryptoResult;


            //default:


        }

        cryptoResult.status = VerificationResult.ValidSignature;
        return cryptoResult;

    }


    VerifyChargingSession(chargingSession:   IChargingSession): ISessionCryptoResult
    {

        var results = new Array<IGDFCrypt01Result>();

        if (chargingSession.measurements)
        {
            for (var measurement of chargingSession.measurements)
            {

                measurement.chargingSession = chargingSession;

                if (measurement.values && measurement.values.length > 0)
                {

                    for (var measurementValue of measurement.values)
                    {

                        measurementValue.measurement = measurement;

                        results.push(this.VerifyMeasurement(measurementValue as IGDFMeasurementValue));

                    }

                }

            }
        }

        return {
            status: SessionVerificationResult.InvalidSignature
        } ;

    }


    VerifyMeasurement(measurementValue:  IGDFMeasurementValue): IGDFCrypt01Result
    {

        function setResult(vr: VerificationResult)
        {
            cryptoResult.status     = vr;
            measurementValue.result = cryptoResult;
            return cryptoResult;
        }

        var buffer        = new ArrayBuffer(320);
        var cryptoBuffer  = new DataView(buffer);

        var cryptoResult:IGDFCrypt01Result = {
            status:                       VerificationResult.InvalidSignature,
            meterId:                      SetText     (cryptoBuffer, measurementValue.measurement.energyMeterId,                                  0),
            timestamp:                    SetTimestamp(cryptoBuffer, measurementValue.timestamp,                                                 10),
            obis:                         SetHex      (cryptoBuffer, measurementValue.measurement.obis,                                          23, false),
            unitEncoded:                  SetInt8     (cryptoBuffer, measurementValue.measurement.unitEncoded,                                   29),
            scale:                        SetInt8     (cryptoBuffer, measurementValue.measurement.scale,                                         30),
            value:                        SetUInt64   (cryptoBuffer, measurementValue.value,                                                     31, true),
            authorizationStart:           SetHex      (cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart["@id"],     41),
            authorizationStartTimestamp:  SetTimestamp(cryptoBuffer, measurementValue.measurement.chargingSession.authorizationStart.timestamp, 169)
        };

        var signatureExpected = measurementValue.signatures[0] as IECCSignature;
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

                cryptoResult.sha256value = //this.crypt.createHash('sha256').
                                           //           update(cryptoBuffer).
                                           //           digest('hex');
                                           this.sha256(cryptoBuffer).then(function(hash) {
                                            return hash.toLowerCase()
                                          });


                const meter = this.GetMeter(measurementValue.measurement.energyMeterId);
                if (meter != null)
                {

                    cryptoResult.meter = meter;

                    var iPublicKey = meter.publicKeys[0] as IPublicKey;
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
                                    return setResult(VerificationResult.ValidSignature);
                                }

                                return setResult(VerificationResult.InvalidSignature);

                            }
                            catch (exception)
                            {
                                return setResult(VerificationResult.InvalidSignature);
                            }

                        }
                        catch (exception)
                        {
                            return setResult(VerificationResult.InvalidPublicKey);
                        }

                    }

                    else
                        return setResult(VerificationResult.PublicKeyNotFound);

                }

                else
                    return setResult(VerificationResult.EnergyMeterNotFound);

            }
            catch (exception)
            {
                return setResult(VerificationResult.InvalidSignature);
            }

        }

    }


    ViewMeasurement(measurementValue:        IMeasurementValue,
                    introDiv:                HTMLDivElement,
                    infoDiv:                 HTMLDivElement,
                    bufferValue:             HTMLDivElement,
                    hashedBufferValue:       HTMLDivElement,
                    publicKeyValue:          HTMLDivElement,
                    signatureExpectedValue:  HTMLDivElement,
                    signatureCheckValue:     HTMLDivElement)
    {

        const result    = measurementValue.result as IGDFCrypt01Result;

        const cryptoDiv = CreateDiv(introDiv,  "row");
                          CreateDiv(cryptoDiv, "id",    "Kryptoverfahren");
                          CreateDiv(cryptoDiv, "value", "GDFCrypt01 (" + this.description + ")");

        hashedBufferValue.parentElement.children[0].innerHTML = "Hashed Puffer (SHA256)";

        this.CreateLine("Zählernummer",             measurementValue.measurement.energyMeterId,                                          result.meterId,                      infoDiv, bufferValue);
        this.CreateLine("Zeitstempel",              parseUTC(measurementValue.timestamp),                                                result.timestamp,                    infoDiv, bufferValue);
        this.CreateLine("OBIS-Kennzahl",            parseOBIS(measurementValue.measurement.obis),                                        result.obis,                         infoDiv, bufferValue);
        this.CreateLine("Einheit (codiert)",        measurementValue.measurement.unitEncoded,                                            result.unitEncoded,                  infoDiv, bufferValue);
        this.CreateLine("Skalierung",               measurementValue.measurement.scale,                                                  result.scale,                        infoDiv, bufferValue);
        this.CreateLine("Messwert",                 measurementValue.value + " Wh",                                                      result.value,                        infoDiv, bufferValue);
        this.CreateLine("Autorisierung",            measurementValue.measurement.chargingSession.authorizationStart["@id"],              result.authorizationStart,           infoDiv, bufferValue);
        this.CreateLine("Autorisierungszeitpunkt",  parseUTC(measurementValue.measurement.chargingSession.authorizationStart.timestamp), result.authorizationStartTimestamp,  infoDiv, bufferValue);


        // Buffer
        bufferValue.parentElement.children[0].innerHTML = "Puffer";
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

            case VerificationResult.UnknownCTRFormat:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Unbekanntes Transparenzdatenformat</div>';
                break;

            case VerificationResult.EnergyMeterNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Energiezähler</div>';
                break;

            case VerificationResult.PublicKeyNotFound:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case VerificationResult.InvalidPublicKey:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültiger Public Key</div>';
                break;

            case VerificationResult.InvalidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

            case VerificationResult.ValidSignature:
                signatureCheckValue.innerHTML = '<i class="fas fa-check-circle"></i><div id="description">Gültige Signatur</div>';
                break;


            default:
                signatureCheckValue.innerHTML = '<i class="fas fa-times-circle"></i><div id="description">Ungültige Signatur</div>';
                break;

        }

    }

}