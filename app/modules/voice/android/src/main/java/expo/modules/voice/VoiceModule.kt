package expo.modules.voice

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.os.Bundle
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 안드로이드 기본 음성 인식(SpeechRecognizer)을 감싼다. 기기의 구글 음성 서비스를 쓰므로 API 비용이 없다.
 * 이벤트: onPartial{text} · onResult{text} · onError{code,message} · onVolume{level} · onEnd
 */
class VoiceModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var lastVolumeAt = 0L

  private fun errorText(code: Int) = when (code) {
    SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
    SpeechRecognizer.ERROR_CLIENT -> "client"
    else -> "error_$code"
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {
      val now = System.currentTimeMillis()
      if (now - lastVolumeAt > 90) {
        lastVolumeAt = now
        sendEvent("onVolume", mapOf("level" to rmsdB.toDouble()))
      }
    }
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() { sendEvent("onEnd", mapOf<String, Any?>()) }
    override fun onError(error: Int) { sendEvent("onError", mapOf("code" to error, "message" to errorText(error))) }
    override fun onResults(results: Bundle?) {
      val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
      sendEvent("onResult", mapOf("text" to t))
    }
    override fun onPartialResults(partialResults: Bundle?) {
      val t = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
      sendEvent("onPartial", mapOf("text" to t))
    }
    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private fun destroyNow() {
    recognizer?.let {
      try { it.cancel() } catch (_: Exception) {}
      try { it.destroy() } catch (_: Exception) {}
    }
    recognizer = null
  }

  override fun definition() = ModuleDefinition {
    Name("Voice")
    Events("onPartial", "onResult", "onError", "onVolume", "onEnd")

    Function("isAvailable") {
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      SpeechRecognizer.isRecognitionAvailable(ctx)
    }

    Function("start") { lang: String ->
      val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      main.post {
        destroyNow()
        val r = SpeechRecognizer.createSpeechRecognizer(ctx)
        r.setRecognitionListener(listener)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
          putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
        }
        recognizer = r
        r.startListening(intent)
      }
      null
    }

    Function("stop") { main.post { try { recognizer?.stopListening() } catch (_: Exception) {} }; null }
    Function("cancel") { main.post { destroyNow() }; null }

    OnDestroy { main.post { destroyNow() } }
  }
}
