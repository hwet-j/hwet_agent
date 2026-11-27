package expo.modules.launcher

import android.app.SearchManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.provider.AlarmClock
import android.provider.MediaStore
import android.view.KeyEvent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 기기의 앱 실행·음악 재생·미디어 제어·타이머/알람. 앱을 "여는" 동작만 하고 다른 앱의 데이터는 읽지 않는다.
 */
class LauncherModule : Module() {
  private fun ctx(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun start(intent: Intent): Boolean = try {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    (appContext.currentActivity ?: ctx()).startActivity(intent)
    true
  } catch (e: Exception) {
    false
  }

  private fun audio() = ctx().getSystemService(Context.AUDIO_SERVICE) as AudioManager

  override fun definition() = ModuleDefinition {
    Name("Launcher")

    /** 런처에 보이는 설치된 앱 [{label, package}] */
    Function("listApps") {
      val pm = ctx().packageManager
      val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(i, 0)
        .map { mapOf("label" to it.loadLabel(pm).toString(), "package" to it.activityInfo.packageName) }
        .distinctBy { it["package"] }
        .sortedBy { it["label"] }
    }

    Function("launchApp") { pkg: String ->
      val i = ctx().packageManager.getLaunchIntentForPackage(pkg)
      if (i == null) false else start(i)
    }

    /** "검색해서 재생"(MEDIA_PLAY_FROM_SEARCH). pkg 를 주면 그 앱으로, 없으면 기기가 고른 음악 앱으로 */
    Function("playMusic") { query: String, pkg: String? ->
      val i = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH).apply {
        putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
        putExtra(SearchManager.QUERY, query)
        if (pkg != null) setPackage(pkg)
      }
      if (i.resolveActivity(ctx().packageManager) == null) false else start(i)
    }

    /** 지금 재생 중인 미디어 제어: play_pause · play · pause · next · previous · stop */
    Function("mediaKey") { action: String ->
      val code = when (action) {
        "play_pause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
        "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
        "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
        "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
        "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
        else -> return@Function false
      }
      val am = audio()
      am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
      am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
      true
    }

    /** 미디어 음량 0~100 (%) 로 설정하고 현재 값을 돌려준다 */
    Function("setVolume") { percent: Int ->
      val am = audio()
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      am.setStreamVolume(AudioManager.STREAM_MUSIC, (max * percent.coerceIn(0, 100) / 100.0).toInt(), AudioManager.FLAG_SHOW_UI)
      (am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100.0 / max).toInt()
    }

    Function("getVolume") {
      val am = audio()
      (am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100.0 / am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)).toInt()
    }

    Function("setTimer") { seconds: Int, label: String? ->
      val i = Intent(AlarmClock.ACTION_SET_TIMER).apply {
        putExtra(AlarmClock.EXTRA_LENGTH, seconds)
        if (label != null) putExtra(AlarmClock.EXTRA_MESSAGE, label)
        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
      }
      start(i)
    }

    /** days: 반복 요일(일=1 … 토=7, java.util.Calendar 규약), 비우면 한 번만 */
    Function("setAlarm") { hour: Int, minute: Int, label: String?, days: List<Int>? ->
      val i = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        if (label != null) putExtra(AlarmClock.EXTRA_MESSAGE, label)
        if (!days.isNullOrEmpty()) putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, ArrayList(days))
        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
      }
      start(i)
    }
  }
}
