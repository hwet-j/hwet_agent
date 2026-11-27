package expo.modules.voice

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.TileService
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/** 비서를 듣기 모드로 여는 링크 (앱의 채팅 화면이 listen=1 을 보고 음성 화면을 띄운다) */
internal const val LISTEN_URI = "hwetassistant://?listen=1"

private fun listenIntent(): Intent =
  Intent(Intent.ACTION_VIEW, Uri.parse(LISTEN_URI)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

/** 기본 디지털 어시스턴트로 선택할 수 있게 하는 빈 서비스 (호출은 세션 서비스가 처리) */
class AssistVoiceService : VoiceInteractionService()

class AssistSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: Bundle?): VoiceInteractionSession = AssistSession(this)
}

/** 홈/전원 버튼 길게 누르기 등으로 호출되면 앱을 듣기 모드로 연다 */
class AssistSession(private val appContext: Context) : VoiceInteractionSession(appContext) {
  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    try {
      appContext.startActivity(listenIntent())
    } catch (_: Exception) {
    }
    hide()
  }
}

/** 빠른 설정 타일 */
class AssistTileService : TileService() {
  @Suppress("DEPRECATION")
  override fun onClick() {
    super.onClick()
    val intent = listenIntent()
    if (Build.VERSION.SDK_INT >= 34) {
      val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      startActivityAndCollapse(pi)
    } else {
      startActivityAndCollapse(intent)
    }
  }
}
